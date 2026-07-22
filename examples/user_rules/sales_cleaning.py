import pandas as pd
import numpy as np

def clean_sales_data(df, currency='USD', remove_outliers=True):
    df_copy=df.copy()
    if 'price' in df_copy.columns and df_copy['price'].dtype=='object':
        df_copy['price']=df_copy['price'].replace('[\$,]','',regex=True).astype(float)
    if 'date' in df_copy.columns:
        df_copy['date']=pd.to_datetime(df_copy['date'])
        df_copy['year']=df_copy['date'].dt.year
        df_copy['month']=df_copy['date'].dt.month
    if remove_outliers and 'price' in df_copy.columns:
        Q1=df_copy['price'].quantile(0.25); Q3=df_copy['price'].quantile(0.75); IQR=Q3-Q1
        df_copy=df_copy[(df_copy['price']>=Q1-1.5*IQR)&(df_copy['price']<=Q3+1.5*IQR)]
    if 'price' in df_copy.columns and 'quantity' in df_copy.columns:
        df_copy['total_revenue']=df_copy['price']*df_copy['quantity']
    return df_copy
