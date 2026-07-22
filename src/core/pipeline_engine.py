import pandas as pd
import numpy as np
from typing import Dict, Any, List, Callable, Optional, Union
from dataclasses import dataclass, field
from enum import Enum
import json, re, inspect
import os, json, inspect

class StepType(Enum):
    CLEANING="cleaning"; TRANSFORM="transform"; FILTER="filter"; AGGREGATE="aggregate"; CUSTOM="custom"; CONDITIONAL="conditional"; VALIDATION="validation"

@dataclass
class PipelineStep:
    id: str; name: str; type: StepType; function: Callable; parameters: Dict[str,Any]=field(default_factory=dict); condition: Optional[str]=None; depends_on: List[str]=field(default_factory=list); description: str=""; enabled: bool=True
    def to_dict(self): return {'id':self.id,'name':self.name,'type':self.type.value,'parameters':self.parameters,'condition':self.condition,'depends_on':self.depends_on,'description':self.description,'enabled':self.enabled}

@dataclass
class Pipeline:
    name: str; steps: List[PipelineStep]=field(default_factory=list); variables: Dict[str,Any]=field(default_factory=dict); version: str="1.0"
    def add_step(self, step): self.steps.append(step)
    def insert_step(self, index, step): self.steps.insert(index, step)
    def remove_step(self, step_id): self.steps=[s for s in self.steps if s.id!=step_id]
    def get_step(self, step_id):
        for s in self.steps:
            if s.id==step_id: return s
        return None
    def reorder_steps(self, new_order):
        step_dict={s.id:s for s in self.steps}
        self.steps=[step_dict[id] for id in new_order if id in step_dict]

class PipelineEngine:
    def __init__(self):
        self.pipelines={}
        self.builtin_functions=self._register_builtins()
        self.user_functions={}
        self.execution_history=[]
        self.data_snapshots={}
    def _register_builtins(self):
        return {
            'remove_duplicates': self._remove_duplicates,
            'handle_missing': self._handle_missing,
            'standardize_text': self._standardize_text,
            'remove_outliers': self._remove_outliers,
            'fix_data_types': self._fix_data_types,
            'trim_whitespace': self._trim_whitespace,
            'strip_special_chars': self._strip_special_chars,
            'encode_categorical': self._encode_categorical,
            'scale_features': self._scale_features,
            'create_features': self._create_features,
            'bin_numeric': self._bin_numeric,
            'log_transform': self._log_transform,
            'one_hot_encode': self._one_hot_encode,
            'label_encode': self._label_encode,
            'filter_by_condition': self._filter_by_condition,
            'filter_outliers': self._filter_outliers,
            'select_columns': self._select_columns,
            'drop_columns': self._drop_columns,
            'group_by_aggregate': self._group_by_aggregate,
            'pivot_table': self._pivot_table,
            'apply_custom': self._apply_custom,
            'apply_function': self._apply_function,
            'apply_lambda': self._apply_lambda,
            'validate_schema': self._validate_schema,
            'validate_range': self._validate_range,
            'validate_regex': self._validate_regex,
        }
    def create_pipeline(self, name: str) -> Pipeline:
        p=Pipeline(name=name); self.pipelines[name]=p; return p
    def load_pipeline(self, pipeline: Pipeline): self.pipelines[pipeline.name]=pipeline
    def add_custom_function(self, name: str, func: Callable, description: str = "", code: str = None):
        """Register a user-defined function with its source code."""
        self.user_functions[name] = {
            'function': func,
            'description': description,
            'code': code
        }
    def execute_pipeline(self, pipeline_name: str, data: Union[pd.DataFrame, Dict]) -> Dict:
        if pipeline_name not in self.pipelines: raise ValueError(f"Pipeline '{pipeline_name}' not found")
        pipeline=self.pipelines[pipeline_name]
        context={'data':data, 'variables':pipeline.variables.copy(), 'history':[], 'snapshots':{}, 'errors':[], 'warnings':[]}
        self.data_snapshots[f"{pipeline_name}_original"]=data.copy() if isinstance(data, pd.DataFrame) else data
        for idx, step in enumerate(pipeline.steps):
            if not step.enabled:
                context['warnings'].append(f"Step {step.name} skipped (disabled)")
                continue
            try:
                if step.depends_on:
                    for dep in step.depends_on:
                        if dep not in [s.id for s in pipeline.steps[:idx] if s.enabled]:
                            context['errors'].append(f"Step '{step.name}' depends on '{dep}' which hasn't been executed")
                            continue
                if step.condition and not self._evaluate_condition(step.condition, context):
                    context['warnings'].append(f"Step {step.name} skipped (condition not met)")
                    continue
                result = self._execute_step(step, context)
                context['data'] = result
                context['history'].append({'step':step.id,'name':step.name,'timestamp':pd.Timestamp.now().isoformat(),'success':True})
                if idx % 5 == 0:
                    key=f"{pipeline_name}_step_{idx}"
                    self.data_snapshots[key]=context['data'].copy() if isinstance(context['data'], pd.DataFrame) else context['data']
                    context['snapshots'][key]=idx
            except Exception as e:
                context['errors'].append(f"Error in step '{step.name}': {str(e)}")
                context['history'].append({'step':step.id,'name':step.name,'timestamp':pd.Timestamp.now().isoformat(),'success':False,'error':str(e)})
                if pipeline.variables.get('stop_on_error', False): break
        self.execution_history.append({'pipeline':pipeline_name,'timestamp':pd.Timestamp.now().isoformat(),'steps_executed':len(context['history']),'errors':len(context['errors']),'warnings':len(context['warnings'])})
        return context
    def _execute_step(self, step, context):
        data=context['data']; variables=context['variables']
        resolved_params=self._resolve_parameters(step.parameters, variables, data)
        func=None
        if step.type==StepType.CUSTOM:
            func=self.user_functions.get(step.name, {}).get('function')
        if not func: func=self.builtin_functions.get(step.name)
        if not func: raise ValueError(f"Unknown function: {step.name}")
        if step.type==StepType.FILTER: return func(data, **resolved_params)
        elif step.type==StepType.CUSTOM: return func(data, context, **resolved_params)
        else: return func(data, **resolved_params)
    def _resolve_parameters(self, params, variables, data):
        resolved={}
        for k,v in params.items():
            if isinstance(v,str) and v.startswith('$'):
                var_name=v[1:]
                resolved[k]=variables.get(var_name, v)
            else:
                resolved[k]=v
        return resolved
    def _evaluate_condition(self, condition, context):
        try:
            data=context['data']
            if not isinstance(data, pd.DataFrame): return True
            parts=condition.split()
            if len(parts)==3:
                col, op, val = parts
                try: val=float(val)
                except: val=val.strip("'\"")
                if op=='>': return (data[col]>val).any()
                elif op=='<': return (data[col]<val).any()
                elif op=='==': return (data[col]==val).any()
                elif op=='!=': return (data[col]!=val).any()
                elif op=='>=': return (data[col]>=val).any()
                elif op=='<=': return (data[col]<=val).any()
            safe_dict={'data':data,'context':context,'len':len,'max':max,'min':min,'sum':sum,'any':any,'all':all}
            return eval(condition, {"__builtins__":{}}, safe_dict)
        except: return True
    # ---------- built-in functions (shortened) ----------
    def _remove_duplicates(self, df, **kwargs):
        subset=kwargs.get('subset'); keep=kwargs.get('keep','first')
        return df.drop_duplicates(subset=subset, keep=keep)
    def _handle_missing(self, df, **kwargs):
        strategy=kwargs.get('strategy','drop'); columns=kwargs.get('columns'); fill_value=kwargs.get('fill_value')
        df_copy=df.copy()
        if columns is None: columns=df.columns
        if strategy=='drop': df_copy=df_copy.dropna(subset=columns)
        elif strategy=='fill_constant': df_copy[columns]=df_copy[columns].fillna(fill_value)
        elif strategy=='fill_mean':
            for col in columns:
                if pd.api.types.is_numeric_dtype(df_copy[col]): df_copy[col]=df_copy[col].fillna(df_copy[col].mean())
        elif strategy=='fill_median':
            for col in columns:
                if pd.api.types.is_numeric_dtype(df_copy[col]): df_copy[col]=df_copy[col].fillna(df_copy[col].median())
        elif strategy=='fill_mode':
            for col in columns:
                mode_val=df_copy[col].mode()
                if not mode_val.empty: df_copy[col]=df_copy[col].fillna(mode_val[0])
        elif strategy=='interpolate': df_copy[columns]=df_copy[columns].interpolate()
        elif strategy=='forward_fill': df_copy[columns]=df_copy[columns].ffill()
        elif strategy=='backward_fill': df_copy[columns]=df_copy[columns].bfill()
        return df_copy
    def _standardize_text(self, df, **kwargs):
        columns=kwargs.get('columns'); case=kwargs.get('case','lower'); strip=kwargs.get('strip',True); remove_punctuation=kwargs.get('remove_punctuation',False); replace_patterns=kwargs.get('replace_patterns',{})
        if columns is None: columns=df.select_dtypes(include=['object']).columns.tolist()
        df_copy=df.copy()
        for col in columns:
            if strip: df_copy[col]=df_copy[col].str.strip()
            if case=='lower': df_copy[col]=df_copy[col].str.lower()
            elif case=='upper': df_copy[col]=df_copy[col].str.upper()
            elif case=='title': df_copy[col]=df_copy[col].str.title()
            elif case=='capitalize': df_copy[col]=df_copy[col].str.capitalize()
            if remove_punctuation:
                import string; df_copy[col]=df_copy[col].str.replace(f'[{string.punctuation}]', '', regex=True)
            for pat, rep in replace_patterns.items():
                df_copy[col]=df_copy[col].str.replace(pat, rep, regex=True)
        return df_copy
    def _remove_outliers(self, df, **kwargs):
        columns=kwargs.get('columns'); method=kwargs.get('method','iqr'); threshold=kwargs.get('threshold',1.5)
        if columns is None: columns=df.select_dtypes(include=[np.number]).columns.tolist()
        df_copy=df.copy()
        for col in columns:
            if method=='iqr':
                Q1=df_copy[col].quantile(0.25); Q3=df_copy[col].quantile(0.75); IQR=Q3-Q1
                lower=Q1-threshold*IQR; upper=Q3+threshold*IQR
                df_copy=df_copy[(df_copy[col]>=lower)&(df_copy[col]<=upper)]
            elif method=='zscore':
                from scipy import stats
                df_copy=df_copy[np.abs(stats.zscore(df_copy[col])) < threshold]
            elif method=='percentile':
                lower=df_copy[col].quantile(threshold/100); upper=df_copy[col].quantile(1-threshold/100)
                df_copy=df_copy[(df_copy[col]>=lower)&(df_copy[col]<=upper)]
            elif method=='mad':
                median=df_copy[col].median(); mad=np.median(np.abs(df_copy[col]-median))
                df_copy=df_copy[np.abs(df_copy[col]-median) < threshold*mad]
        return df_copy
    def _fix_data_types(self, df, **kwargs):
        type_mapping=kwargs.get('type_mapping',{}); auto_detect=kwargs.get('auto_detect',False)
        df_copy=df.copy()
        for col, dtype in type_mapping.items():
            try:
                if dtype=='datetime': df_copy[col]=pd.to_datetime(df_copy[col])
                elif dtype=='numeric': df_copy[col]=pd.to_numeric(df_copy[col], errors='coerce')
                else: df_copy[col]=df_copy[col].astype(dtype)
            except: pass
        if auto_detect:
            for col in df_copy.columns:
                try: df_copy[col]=pd.to_numeric(df_copy[col], errors='coerce')
                except: pass
                try: df_copy[col]=pd.to_datetime(df_copy[col], errors='coerce')
                except: pass
        return df_copy
    def _trim_whitespace(self, df, **kwargs):
        columns=kwargs.get('columns')
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=['object']).columns.tolist()
        for col in columns:
            if df_copy[col].dtype=='object': df_copy[col]=df_copy[col].str.strip()
        return df_copy
    def _strip_special_chars(self, df, **kwargs):
        columns=kwargs.get('columns'); chars_to_strip=kwargs.get('chars_to_strip', r'[^a-zA-Z0-9\s]')
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=['object']).columns.tolist()
        for col in columns:
            df_copy[col]=df_copy[col].str.replace(chars_to_strip, '', regex=True)
        return df_copy
    def _encode_categorical(self, df, **kwargs):
        columns=kwargs.get('columns'); method=kwargs.get('method','label')
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=['object']).columns.tolist()
        if method=='label':
            from sklearn.preprocessing import LabelEncoder
            for col in columns:
                le=LabelEncoder(); df_copy[col]=le.fit_transform(df_copy[col].astype(str))
        elif method=='onehot':
            for col in columns:
                dummies=pd.get_dummies(df_copy[col], prefix=col, prefix_sep='_')
                df_copy=pd.concat([df_copy.drop(columns=[col]), dummies], axis=1)
        elif method=='frequency':
            for col in columns:
                freq=df_copy[col].value_counts(normalize=True)
                df_copy[col]=df_copy[col].map(freq)
        return df_copy
    def _scale_features(self, df, **kwargs):
        columns=kwargs.get('columns'); method=kwargs.get('method','standard')
        if columns is None: columns=df.select_dtypes(include=[np.number]).columns.tolist()
        df_copy=df.copy()
        if method=='standard':
            from sklearn.preprocessing import StandardScaler
            scaler=StandardScaler(); df_copy[columns]=scaler.fit_transform(df_copy[columns])
        elif method=='minmax':
            from sklearn.preprocessing import MinMaxScaler
            scaler=MinMaxScaler(); df_copy[columns]=scaler.fit_transform(df_copy[columns])
        elif method=='robust':
            from sklearn.preprocessing import RobustScaler
            scaler=RobustScaler(); df_copy[columns]=scaler.fit_transform(df_copy[columns])
        return df_copy
    def _create_features(self, df, **kwargs):
        features=kwargs.get('features',[])
        df_copy=df.copy()
        for feat in features:
            if feat['type']=='interaction':
                c1,c2=feat['cols']; new_col=feat.get('new_col', f"{c1}_{c2}_interaction")
                if c1 in df_copy.columns and c2 in df_copy.columns:
                    df_copy[new_col]=df_copy[c1]*df_copy[c2]
            elif feat['type']=='polynomial':
                col=feat['col']; degree=feat.get('degree',2)
                if col in df_copy.columns:
                    for d in range(2, degree+1): df_copy[f"{col}_pow_{d}"]=df_copy[col]**d
            elif feat['type']=='math':
                col=feat['col']; op=feat['operation']
                if col in df_copy.columns:
                    if op=='sqrt': df_copy[f"{col}_sqrt"]=np.sqrt(df_copy[col])
                    elif op=='log': df_copy[f"{col}_log"]=np.log(df_copy[col]+1)
                    elif op=='exp': df_copy[f"{col}_exp"]=np.exp(df_copy[col])
                    elif op=='reciprocal': df_copy[f"{col}_reciprocal"]=1/(df_copy[col]+1e-10)
        return df_copy
    def _bin_numeric(self, df, **kwargs):
        columns=kwargs.get('columns'); bins=kwargs.get('bins',5); method=kwargs.get('method','equal_width')
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=[np.number]).columns.tolist()
        for col in columns:
            if method=='equal_width':
                df_copy[f"{col}_binned"]=pd.cut(df_copy[col], bins=bins)
            elif method=='equal_frequency':
                df_copy[f"{col}_binned"]=pd.qcut(df_copy[col], q=bins, duplicates='drop')
            elif method=='custom':
                custom_bins=kwargs.get('custom_bins',{})
                if col in custom_bins:
                    df_copy[f"{col}_binned"]=pd.cut(df_copy[col], bins=custom_bins[col])
        return df_copy
    def _log_transform(self, df, **kwargs):
        columns=kwargs.get('columns'); base=kwargs.get('base', np.e)
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=[np.number]).columns.tolist()
        for col in columns:
            if base==np.e: df_copy[f"{col}_log"]=np.log(df_copy[col]+1)
            elif base==10: df_copy[f"{col}_log10"]=np.log10(df_copy[col]+1)
            elif base==2: df_copy[f"{col}_log2"]=np.log2(df_copy[col]+1)
        return df_copy
    def _one_hot_encode(self, df, **kwargs):
        columns=kwargs.get('columns'); drop_first=kwargs.get('drop_first',False)
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=['object']).columns.tolist()
        for col in columns:
            dummies=pd.get_dummies(df_copy[col], prefix=col, prefix_sep='_', drop_first=drop_first)
            df_copy=pd.concat([df_copy.drop(columns=[col]), dummies], axis=1)
        return df_copy
    def _label_encode(self, df, **kwargs):
        columns=kwargs.get('columns')
        df_copy=df.copy()
        if columns is None: columns=df_copy.select_dtypes(include=['object']).columns.tolist()
        from sklearn.preprocessing import LabelEncoder
        for col in columns:
            le=LabelEncoder(); df_copy[col]=le.fit_transform(df_copy[col].astype(str))
        return df_copy
    def _filter_by_condition(self, df, **kwargs):
        condition=kwargs.get('condition')
        if not condition: return df
        return df.query(condition)
    def _filter_outliers(self, df, **kwargs):
        columns=kwargs.get('columns'); method=kwargs.get('method','iqr'); threshold=kwargs.get('threshold',3)
        if columns is None: columns=df.select_dtypes(include=[np.number]).columns.tolist()
        df_copy=df.copy()
        for col in columns:
            if method=='iqr':
                Q1=df_copy[col].quantile(0.25); Q3=df_copy[col].quantile(0.75); IQR=Q3-Q1
                lower=Q1-threshold*IQR; upper=Q3+threshold*IQR
                df_copy=df_copy[(df_copy[col]>=lower)&(df_copy[col]<=upper)]
        return df_copy
    def _select_columns(self, df, **kwargs):
        columns=kwargs.get('columns')
        if not columns: return df
        return df[columns]
    def _drop_columns(self, df, **kwargs):
        columns=kwargs.get('columns')
        if not columns: return df
        return df.drop(columns=columns)
    def _group_by_aggregate(self, df, **kwargs):
        by=kwargs.get('by'); aggs=kwargs.get('aggregations',{})
        if not by: return df
        return df.groupby(by).agg(aggs)
    def _pivot_table(self, df, **kwargs):
        index=kwargs.get('index'); columns=kwargs.get('columns'); values=kwargs.get('values'); aggfunc=kwargs.get('aggfunc','mean')
        if not all([index, columns, values]): return df
        return df.pivot_table(index=index, columns=columns, values=values, aggfunc=aggfunc)
    def _apply_custom(self, df, **kwargs):
        func=kwargs.get('func'); axis=kwargs.get('axis',0); args=kwargs.get('args',()); kwargs_func=kwargs.get('kwargs_func',{})
        if callable(func): return df.apply(func, axis=axis, args=args, **kwargs_func)
        return df
    def _apply_function(self, df, **kwargs):
        func_name=kwargs.get('func_name'); params=kwargs.get('params',{})
        if func_name in self.builtin_functions: return self.builtin_functions[func_name](df, **params)
        elif func_name in self.user_functions: return self.user_functions[func_name]['function'](df, **params)
        return df
    def _apply_lambda(self, df, **kwargs):
        expr=kwargs.get('lambda_expr')
        if expr:
            try:
                func=eval(expr)
                if callable(func): return func(df)
            except: pass
        return df
    def _validate_schema(self, df, **kwargs):
        schema=kwargs.get('schema',{}); errors=[]
        for col, dtype in schema.items():
            if col not in df.columns: errors.append(f"Column '{col}' not found")
            elif str(df[col].dtype)!=dtype: errors.append(f"Column '{col}' expected {dtype}, got {df[col].dtype}")
        if errors: raise ValueError(f"Validation errors: {', '.join(errors)}")
        return True
    def _validate_range(self, df, **kwargs):
        ranges=kwargs.get('ranges',{}); errors=[]
        for col, (lo, hi) in ranges.items():
            if col in df.columns:
                if df[col].min()<lo or df[col].max()>hi: errors.append(f"Column '{col}' outside range [{lo},{hi}]")
        if errors: raise ValueError(f"Range validation errors: {', '.join(errors)}")
        return True
    def _validate_regex(self, df, **kwargs):
        patterns=kwargs.get('patterns',{}); errors=[]
        for col, pat in patterns.items():
            if col in df.columns:
                invalid=~df[col].astype(str).str.match(pat)
                if invalid.any(): errors.append(f"Column '{col}' has {invalid.sum()} values not matching pattern")
        if errors: raise ValueError(f"Regex validation errors: {', '.join(errors)}")
        return True
    def get_execution_history(self): return self.execution_history
    def rollback_to_snapshot(self, snapshot_key, data):
        return self.data_snapshots.get(snapshot_key, data)
    def export_pipeline(self, pipeline_name):
        if pipeline_name not in self.pipelines: raise ValueError(f"Pipeline '{pipeline_name}' not found")
        p=self.pipelines[pipeline_name]
        return {'name':p.name,'version':p.version,'steps':[s.to_dict() for s in p.steps],'variables':p.variables}
    def import_pipeline(self, pipeline_dict):
        p=Pipeline(name=pipeline_dict['name']); p.version=pipeline_dict.get('version','1.0'); p.variables=pipeline_dict.get('variables',{})
        for sd in pipeline_dict.get('steps',[]):
            step=PipelineStep(id=sd['id'], name=sd['name'], type=StepType(sd['type']),
                              function=self.builtin_functions.get(sd['name']),
                              parameters=sd.get('parameters',{}), condition=sd.get('condition'),
                              depends_on=sd.get('depends_on',[]), description=sd.get('description',''),
                              enabled=sd.get('enabled',True))
            p.add_step(step)
        self.pipelines[p.name]=p; return p
    def save_state(self, filepath="data/engine_state.json"):
        """Save user functions and pipelines to disk."""
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        state = {
            'user_functions': {},
            'pipelines': {}
        }
        # Save user functions
        for name, info in self.user_functions.items():
            # Try to get code from stored code, else from inspect
            code = info.get('code')
            if not code:
                try:
                    code = inspect.getsource(info['function'])
                except:
                    code = None
            state['user_functions'][name] = {
                'description': info.get('description', ''),
                'code': code
            }
        # Save pipelines
        for name in self.pipelines.keys():
            try:
                state['pipelines'][name] = self.export_pipeline(name)
            except:
                pass
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2, default=str)

    def load_state(self, filepath="data/engine_state.json"):
        """Load user functions and pipelines from disk."""
        if not os.path.exists(filepath):
            return
        with open(filepath, 'r') as f:
            state = json.load(f)
        # Restore user functions
        for name, info in state.get('user_functions', {}).items():
            code = info.get('code')
            if code:
                try:
                    local = {}
                    exec(code, globals(), local)
                    for n, obj in local.items():
                        if callable(obj) and n == name:
                            self.add_custom_function(name, obj, info.get('description', ''), code)
                            break
                except Exception as e:
                    print(f"Error loading function {name}: {e}")
        # Restore pipelines
        for name, pipeline_dict in state.get('pipelines', {}).items():
            try:
                self.import_pipeline(pipeline_dict)
            except Exception as e:
                print(f"Error loading pipeline {name}: {e}")

    def _get_function_code(self, func):
        """Extract source code of a function (if possible)."""
        import inspect
        try:
            return inspect.getsource(func)
        except:
            return None