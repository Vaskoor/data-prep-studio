import streamlit as st
import pandas as pd
import json
from core.pipeline_engine import PipelineEngine, PipelineStep, StepType, Pipeline

class PipelineBuilderUI:
    def __init__(self, engine):
        self.engine=engine
        self.current_pipeline=None
    def render(self):
        st.header("🔧 Build Custom Pipeline")
        st.info("Add steps, set parameters, conditions, and dependencies")
        c1,c2,c3=st.columns(3)
        with c1:
            name=st.text_input("Pipeline Name", value="my_pipeline")
            if st.button("Create New Pipeline"):
                self.current_pipeline=self.engine.create_pipeline(name)
                st.success(f"Created {name}")
                st.session_state['current_pipeline']=name
        with c2:
            if st.button("Load Existing"):
                names=list(self.engine.pipelines.keys())
                if names:
                    sel=st.selectbox("Select", names)
                    self.current_pipeline=self.engine.pipelines[sel]
                    st.success(f"Loaded {sel}")
        with c3:
            if self.current_pipeline and st.button("Export"):
                exp=self.engine.export_pipeline(self.current_pipeline.name)
                st.download_button("Download JSON", json.dumps(exp, indent=2), f"{self.current_pipeline.name}.json", "application/json")
        if not self.current_pipeline:
            st.warning("Create or load a pipeline"); return
        tabs=st.tabs(["📊 Steps","⚙️ Step Editor","📋 Variables","▶️ Execute"])
        with tabs[0]: self.render_steps()
        with tabs[1]: self.render_step_editor()
        with tabs[2]: self.render_variables()
        with tabs[3]: self.render_execution()
    def render_steps(self):
        st.subheader(f"Pipeline: {self.current_pipeline.name}")
        st.caption(f"Total steps: {len(self.current_pipeline.steps)}")
        if not self.current_pipeline.steps:
            st.info("No steps added")
            return
        for idx,step in enumerate(self.current_pipeline.steps):
            with st.expander(f"Step {idx+1}: {step.name} ({step.type.value})", expanded=False):
                c1,c2=st.columns([3,1])
                with c1: st.code(json.dumps(step.to_dict(), indent=2), language="json")
                with c2:
                    if st.button("▲", key=f"up_{step.id}"):
                        if idx>0:
                            self.current_pipeline.steps[idx],self.current_pipeline.steps[idx-1] = \
                                self.current_pipeline.steps[idx-1],self.current_pipeline.steps[idx]
                            st.rerun()
                    if st.button("▼", key=f"down_{step.id}"):
                        if idx<len(self.current_pipeline.steps)-1:
                            self.current_pipeline.steps[idx],self.current_pipeline.steps[idx+1] = \
                                self.current_pipeline.steps[idx+1],self.current_pipeline.steps[idx]
                            st.rerun()
                    if st.button("🗑️", key=f"del_{step.id}"):
                        self.current_pipeline.remove_step(step.id); st.rerun()
    def render_step_editor(self):
        st.subheader("Add New Step")
        c1,c2=st.columns(2)
        with c1:
            step_name=st.text_input("Step Name (Function)")
            step_type=st.selectbox("Step Type", [t.value for t in StepType])
            step_id=st.text_input("Step ID", value=f"step_{len(self.current_pipeline.steps)+1}")
        with c2:
            desc=st.text_area("Description", height=68)
            enabled=st.checkbox("Enabled", True)
        st.subheader("Parameters")
        param_count=st.number_input("Number of parameters", min_value=0,max_value=10,value=2)
        params={}
        for i in range(param_count):
            c1,c2=st.columns(2)
            with c1: key=st.text_input(f"Param {i+1} Name", key=f"pkey_{i}")
            with c2: val=st.text_input(f"Param {i+1} Value", key=f"pval_{i}")
            if key:
                try:
                    if val.lower() in ['true','false']: val=val.lower()=='true'
                    elif val.isdigit(): val=int(val)
                    elif val.replace('.','').isdigit(): val=float(val)
                    elif val.startswith('[') and val.endswith(']'): val=eval(val)
                    elif val.startswith('{') and val.endswith('}'): val=eval(val)
                except: pass
                params[key]=val
        condition=st.text_input("Condition (optional)")
        deps=st.text_input("Dependencies (comma-separated step IDs)")
        dependencies=[d.strip() for d in deps.split(',') if d.strip()]
        if st.button("➕ Add Step"):
            func=self.engine.builtin_functions.get(step_name)
            if not func: func=self.engine.user_functions.get(step_name,{}).get('function')
            if not func:
                st.error(f"Function '{step_name}' not found")
                return
            step=PipelineStep(id=step_id, name=step_name, type=StepType(step_type),
                              function=func, parameters=params, condition=condition or None,
                              depends_on=dependencies, description=desc, enabled=enabled)
            self.current_pipeline.add_step(step)
            st.success(f"Added {step_name}"); st.rerun()
    def render_variables(self):
        st.subheader("Variables")
        c1,c2,c3=st.columns(3)
        with c1: var_name=st.text_input("Var Name")
        with c2: var_value=st.text_input("Var Value")
        with c3:
            if st.button("Add Variable"):
                if var_name:
                    self.current_pipeline.variables[var_name]=var_value
                    st.success(f"Added {var_name}"); st.rerun()
        if self.current_pipeline.variables:
            st.dataframe(pd.DataFrame([{'Variable':k,'Value':v} for k,v in self.current_pipeline.variables.items()]))
            if st.button("Clear All"): self.current_pipeline.variables={}; st.rerun()
    def render_execution(self):
        st.subheader("Execute Pipeline")
        uploaded=st.file_uploader("Upload data", type=['csv','xlsx','json'])
        if not uploaded: st.info("Upload a file"); return
        df=pd.read_csv(uploaded) if uploaded.name.endswith('.csv') else \
           pd.read_excel(uploaded) if uploaded.name.endswith(('.xlsx','.xls')) else \
           pd.read_json(uploaded)
        st.dataframe(df.head())
        if st.button("▶️ Execute Pipeline", type="primary"):
            with st.spinner("Executing..."):
                try:
                    result=self.engine.execute_pipeline(self.current_pipeline.name, df)
                    st.success("✅ Executed!")
                    c1,c2,c3,c4=st.columns(4)
                    with c1: st.metric("Steps", len(result['history']))
                    with c2: st.metric("Errors", len(result['errors']))
                    with c3: st.metric("Warnings", len(result['warnings']))
                    with c4:
                        if isinstance(result['data'], pd.DataFrame): st.metric("Rows", len(result['data']))
                    st.subheader("Processed Data")
                    if isinstance(result['data'], pd.DataFrame): st.dataframe(result['data'].head(20))
                    if result['errors']:
                        st.error("Errors:"); [st.text(f"❌ {e}") for e in result['errors']]
                    if result['warnings']:
                        st.warning("Warnings:"); [st.text(f"⚠️ {w}") for w in result['warnings']]
                    if isinstance(result['data'], pd.DataFrame):
                        csv=result['data'].to_csv(index=False)
                        st.download_button("📥 Download", csv, "processed.csv", "text/csv")
                except Exception as e: st.error(f"Execution failed: {e}")
