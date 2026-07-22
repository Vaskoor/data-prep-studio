import pandas as pd
import numpy as np
from typing import Union, Optional, List, Dict, Any
from sklearn.preprocessing import LabelEncoder

class DataCleaner:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.transformation_log = []
    def remove_duplicates(self, subset: Optional[List[str]]=None, keep: str='first'):
        before=len(self.df); self.df=self.df.drop_duplicates(subset=subset, keep=keep)
        self.transformation_log.append(f"Removed {before-len(self.df)} duplicate rows")
        return self
    def handle_missing_values(self, strategy: str='drop', columns: Optional[List[str]]=None, fill_value=None):
        if columns is None: columns=self.df.columns
        for col in columns:
            if strategy=='drop':
                before=len(self.df); self.df=self.df.dropna(subset=[col])
                self.transformation_log.append(f"Dropped {before-len(self.df)} rows with missing {col}")
            elif strategy=='fill_constant':
                self.df[col]=self.df[col].fillna(fill_value)
                self.transformation_log.append(f"Filled missing in {col} with {fill_value}")
            elif strategy=='fill_mean':
                if pd.api.types.is_numeric_dtype(self.df[col]):
                    self.df[col]=self.df[col].fillna(self.df[col].mean())
                    self.transformation_log.append(f"Filled missing in {col} with mean")
            elif strategy=='fill_median':
                if pd.api.types.is_numeric_dtype(self.df[col]):
                    self.df[col]=self.df[col].fillna(self.df[col].median())
                    self.transformation_log.append(f"Filled missing in {col} with median")
            elif strategy=='fill_mode':
                mode_val=self.df[col].mode()[0] if not self.df[col].mode().empty else None
                if mode_val is not None:
                    self.df[col]=self.df[col].fillna(mode_val)
                    self.transformation_log.append(f"Filled missing in {col} with mode")
            elif strategy=='forward_fill':
                self.df[col]=self.df[col].ffill()
                self.transformation_log.append(f"Forward filled {col}")
            elif strategy=='backward_fill':
                self.df[col]=self.df[col].bfill()
                self.transformation_log.append(f"Backward filled {col}")
        return self
    def standardize_text(self, columns: Optional[List[str]]=None, case: str='lower', strip_whitespace: bool=True):
        if columns is None: columns=self.df.select_dtypes(include=['object']).columns.tolist()
        for col in columns:
            if strip_whitespace:
                self.df[col]=self.df[col].str.strip()
                self.transformation_log.append(f"Stripped whitespace in {col}")
            if case=='lower': self.df[col]=self.df[col].str.lower()
            elif case=='upper': self.df[col]=self.df[col].str.upper()
            elif case=='title': self.df[col]=self.df[col].str.title()
            self.transformation_log.append(f"Converted {col} to {case}")
        return self
    def remove_outliers(self, columns: Optional[List[str]]=None, method: str='iqr', threshold: float=1.5):
        if columns is None: columns=self.df.select_dtypes(include=[np.number]).columns.tolist()
        for col in columns:
            if method=='iqr':
                Q1=self.df[col].quantile(0.25); Q3=self.df[col].quantile(0.75); IQR=Q3-Q1
                lower=Q1-threshold*IQR; upper=Q3+threshold*IQR
                before=len(self.df); self.df=self.df[(self.df[col]>=lower)&(self.df[col]<=upper)]
                self.transformation_log.append(f"Removed {before-len(self.df)} outliers from {col}")
            elif method=='zscore':
                from scipy import stats
                before=len(self.df)
                self.df=self.df[np.abs(stats.zscore(self.df[col])) < threshold]
                self.transformation_log.append(f"Removed {before-len(self.df)} outliers from {col}")
        return self
    def fix_data_types(self, type_mapping: Dict[str, str]):
        for col, dtype in type_mapping.items():
            try:
                if dtype=='datetime': self.df[col]=pd.to_datetime(self.df[col])
                elif dtype=='numeric': self.df[col]=pd.to_numeric(self.df[col], errors='coerce')
                else: self.df[col]=self.df[col].astype(dtype)
                self.transformation_log.append(f"Converted {col} to {dtype}")
            except Exception as e:
                self.transformation_log.append(f"Failed to convert {col}: {e}")
        return self
    def get_cleaned_data(self): return self.df
    def get_transformation_log(self): return self.transformation_log
