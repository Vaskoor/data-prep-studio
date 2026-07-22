import pandas as pd
import numpy as np
from typing import List, Optional, Dict, Any, Union
from sklearn.preprocessing import StandardScaler, MinMaxScaler, LabelEncoder, OneHotEncoder

class DataTransformer:
    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.encoders={}; self.scalers={}; self.transformation_log=[]
    def encode_categorical(self, method: str='label', columns: Optional[List[str]]=None):
        if columns is None: columns=self.df.select_dtypes(include=['object']).columns.tolist()
        for col in columns:
            if method=='label':
                le=LabelEncoder(); self.df[col]=le.fit_transform(self.df[col].astype(str))
                self.encoders[col]=le; self.transformation_log.append(f"Label encoded {col}")
            elif method=='onehot':
                onehot=OneHotEncoder(sparse_output=False, handle_unknown='ignore')
                encoded=onehot.fit_transform(self.df[[col]])
                encoded_df=pd.DataFrame(encoded, columns=[f"{col}_{cat}" for cat in onehot.categories_[0]])
                self.df=pd.concat([self.df.drop(columns=[col]), encoded_df], axis=1)
                self.encoders[col]=onehot
                self.transformation_log.append(f"One-hot encoded {col} into {len(onehot.categories_[0])} cols")
        return self
    def scale_features(self, method: str='standard', columns: Optional[List[str]]=None):
        if columns is None: columns=self.df.select_dtypes(include=[np.number]).columns.tolist()
        if method=='standard': scaler=StandardScaler()
        elif method=='minmax': scaler=MinMaxScaler()
        else: raise ValueError(f"Unsupported scaling method: {method}")
        self.df[columns]=scaler.fit_transform(self.df[columns])
        self.scalers['scaler']=scaler
        self.transformation_log.append(f"Scaled {len(columns)} columns using {method}")
        return self
    def create_features(self, interactions: Optional[List[tuple]]=None, polynomials: Optional[List[str]]=None):
        if interactions:
            for col1, col2 in interactions:
                if col1 in self.df.columns and col2 in self.df.columns and \
                   pd.api.types.is_numeric_dtype(self.df[col1]) and pd.api.types.is_numeric_dtype(self.df[col2]):
                    self.df[f"{col1}_{col2}_product"] = self.df[col1]*self.df[col2]
                    self.transformation_log.append(f"Created interaction: {col1}_{col2}_product")
        if polynomials:
            for col in polynomials:
                if col in self.df.columns and pd.api.types.is_numeric_dtype(self.df[col]):
                    self.df[f"{col}_squared"] = self.df[col]**2
                    self.df[f"{col}_cubed"] = self.df[col]**3
                    self.transformation_log.append(f"Created polynomial features for {col}")
        return self
    def bin_numeric(self, columns: Dict[str, int]):
        for col, bins in columns.items():
            if col in self.df.columns and pd.api.types.is_numeric_dtype(self.df[col]):
                self.df[f"{col}_binned"] = pd.cut(self.df[col], bins=bins, labels=[f"bin_{i}" for i in range(bins)])
                self.transformation_log.append(f"Binned {col} into {bins} bins")
        return self
    def get_transformed_data(self): return self.df
    def get_transformation_log(self): return self.transformation_log
