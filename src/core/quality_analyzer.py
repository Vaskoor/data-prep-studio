import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict

@dataclass
class ColumnQualityReport:
    column_name: str; data_type: str; null_count: int; null_percentage: float
    unique_count: int; duplicates: int; outliers: Optional[Dict]=None; suggestions: List[str]=None
    def to_dict(self): return asdict(self)

class QualityAnalyzer:
    def __init__(self, df: pd.DataFrame):
        self.df = df
        self.reports = []
    def generate_full_report(self) -> Dict[str, Any]:
        return {'overview':self._get_overview(), 'columns':[c.to_dict() for c in self._analyze_columns()],
                'summary':self._get_summary_stats()}
    def _get_overview(self):
        return {'total_rows':len(self.df), 'total_columns':len(self.df.columns),
                'memory_usage':self.df.memory_usage(deep=True).sum()/1024**2,
                'duplicate_rows':self.df.duplicated().sum(), 'missing_cells':self.df.isnull().sum().sum()}
    def _analyze_columns(self):
        reports=[]
        for col in self.df.columns:
            col_data = self.df[col]
            outliers = None
            if pd.api.types.is_numeric_dtype(col_data):
                Q1=col_data.quantile(0.25); Q3=col_data.quantile(0.75); IQR=Q3-Q1
                outliers = ((col_data < (Q1-1.5*IQR)) | (col_data > (Q3+1.5*IQR))).sum()
            suggestions = self._generate_suggestions(col, col_data)
            reports.append(ColumnQualityReport(col, str(col_data.dtype), col_data.isnull().sum(),
                          (col_data.isnull().sum()/len(col_data))*100, col_data.nunique(),
                          len(col_data)-len(col_data.drop_duplicates()),
                          {'count':outliers} if outliers is not None else None, suggestions))
        return reports
    def _generate_suggestions(self, col, data):
        suggestions=[]
        if data.isnull().sum()>0:
            suggestions.append(f"Fill {data.isnull().sum()} missing values")
        if data.dtype=='object':
            if data.str.lower().nunique() < data.nunique():
                suggestions.append("Standardize text case")
        if pd.api.types.is_numeric_dtype(data):
            Q1=data.quantile(0.25); Q3=data.quantile(0.75); IQR=Q3-Q1
            outliers=((data < (Q1-1.5*IQR)) | (data > (Q3+1.5*IQR))).sum()
            if outliers>0: suggestions.append(f"Handle {outliers} outliers")
        if len(data)-len(data.drop_duplicates())>0:
            suggestions.append(f"Remove {len(data)-len(data.drop_duplicates())} duplicates")
        return suggestions
    def _get_summary_stats(self):
        stats={}
        for col in self.df.select_dtypes(include=[np.number]):
            stats[col] = {'mean':self.df[col].mean(), 'std':self.df[col].std(),
                          'min':self.df[col].min(), 'max':self.df[col].max(),
                          'skewness':self.df[col].skew(), 'kurtosis':self.df[col].kurtosis()}
        return stats
