import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from typing import Union, Optional, Tuple, List

class DataSplitter:
    @staticmethod
    def train_test_val_split(df: pd.DataFrame, target_col: str, test_size: float=0.2, val_size: float=0.1,
                             random_state: int=42, stratify: bool=False):
        X=df.drop(columns=[target_col]); y=df[target_col]
        stratify_param = y if stratify else None
        X_train_val, X_test, y_train_val, y_test = train_test_split(X, y, test_size=test_size,
                                                                    random_state=random_state,
                                                                    stratify=stratify_param)
        val_size_relative = val_size / (1-test_size)
        stratify_param_val = y_train_val if stratify else None
        X_train, X_val, y_train, y_val = train_test_split(X_train_val, y_train_val,
                                                          test_size=val_size_relative,
                                                          random_state=random_state,
                                                          stratify=stratify_param_val)
        return pd.concat([X_train, y_train], axis=1), pd.concat([X_val, y_val], axis=1), pd.concat([X_test, y_test], axis=1)
    @staticmethod
    def cross_validation_splits(df: pd.DataFrame, target_col: str, n_splits: int=5, random_state: int=42):
        from sklearn.model_selection import KFold, StratifiedKFold
        X=df.drop(columns=[target_col]); y=df[target_col]
        kf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=random_state) if y.nunique()<20 else KFold(n_splits=n_splits, shuffle=True, random_state=random_state)
        splits=[]
        for train_idx, val_idx in kf.split(X,y):
            splits.append((df.iloc[train_idx], df.iloc[val_idx]))
        return splits
    @staticmethod
    def time_series_split(df: pd.DataFrame, date_col: str, train_end_date: str, val_end_date: str):
        df['date']=pd.to_datetime(df[date_col])
        return df[df['date']<=train_end_date], df[(df['date']>train_end_date)&(df['date']<=val_end_date)], df[df['date']>val_end_date]
