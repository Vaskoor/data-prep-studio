import streamlit as st
import pandas as pd
import numpy as np
import json, os, sys, tempfile, io
from pathlib import Path
import plotly.express as px
import requests

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.pipeline_engine import PipelineEngine, PipelineStep, StepType, Pipeline
from core.data_loader import UniversalDataLoader
from web.pipeline_builder import PipelineBuilderUI

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

st.set_page_config(page_title="Data Prep Studio", layout="wide")

# Initialize engine once
if 'engine' not in st.session_state:
    st.session_state['engine'] = PipelineEngine()
engine = st.session_state['engine']

# Load saved state (custom functions & pipelines) on first run
if not st.session_state.get('state_loaded'):
    engine.load_state()
    st.session_state['state_loaded'] = True

# Cache large file loading
@st.cache_data
def load_cached_file(file_path: str) -> dict:
    loader = UniversalDataLoader()
    return loader.load(file_path)

class FullControlDataPrepUI:
    def __init__(self):
        self.engine = engine
        self.loader = UniversalDataLoader()
        # Initialize session state keys
        if 'current_data' not in st.session_state:
            st.session_state['current_data'] = None
        if 'show_dialog' not in st.session_state:
            st.session_state['show_dialog'] = False
        if 'active_pipeline' not in st.session_state:
            st.session_state['active_pipeline'] = None
        if 'show_pipeline_manager' not in st.session_state:
            st.session_state['show_pipeline_manager'] = False
        if 'show_custom_function' not in st.session_state:
            st.session_state['show_custom_function'] = False

    @property
    def current_data(self):
        return st.session_state.get('current_data')

    @current_data.setter
    def current_data(self, value):
        st.session_state['current_data'] = value

    def run(self):
        st.title("🎯 Data Preparation Studio")
        st.markdown("**Full Control Mode** - You control every aspect")
        st.markdown("---")

        # Sidebar
        with st.sidebar:
            st.header("🎛️ Control Panel")
            if st.button("Load Data"):
                st.session_state['show_dialog'] = True
                st.rerun()

            if self.current_data is not None:
                if isinstance(self.current_data, pd.DataFrame):
                    st.info(f"Loaded: {len(self.current_data)} rows, {len(self.current_data.columns)} cols")
                elif isinstance(self.current_data, dict) and 'train' in self.current_data:
                    st.info(f"Split: train {len(self.current_data['train'])} rows, val {len(self.current_data['val'])} rows, test {len(self.current_data['test'])} rows")

            st.markdown("---")
            st.subheader("🔧 Pipelines")
            pipeline_names = list(self.engine.pipelines.keys())
            if pipeline_names:
                selected = st.selectbox("Active Pipeline", pipeline_names)
                if selected:
                    st.session_state['active_pipeline'] = selected
            if st.button("📁 Manage Pipelines"):
                st.session_state['show_pipeline_manager'] = True
                st.rerun()
            st.markdown("---")
            st.subheader("🛠️ Custom Functions")
            if st.button("Add Custom Function"):
                st.session_state['show_custom_function'] = True
                st.rerun()

        # Main tabs – added "📤 Export" as the last tab
        tabs = st.tabs(["📊 Data Explorer", "🔧 Pipeline Builder", "⚡ Quick Actions", "📈 Custom Rules", "📜 History", "📤 Export"])
        with tabs[0]:
            self.data_explorer()
        with tabs[1]:
            if st.session_state.get('active_pipeline'):
                builder = PipelineBuilderUI(self.engine)
                builder.render()
            else:
                st.warning("Create or select a pipeline from the sidebar")
        with tabs[2]:
            self.quick_actions()
        with tabs[3]:
            self.custom_rules()
        with tabs[4]:
            self.history_view()
        with tabs[5]:
            self.export_tab()

        # Dialogs (modals)
        if st.session_state.get('show_pipeline_manager'):
            self.pipeline_manager()
        if st.session_state.get('show_custom_function'):
            self.custom_function_creator()

        # Show load dialog if flag is set
        if st.session_state.get('show_dialog'):
            self.load_data_dialog()

    def load_data_dialog(self):
        # Only show if flag is True
        if not st.session_state.get('show_dialog'):
            return

        with st.expander("Load Data", expanded=True):
            source = st.radio("Source", ["File Upload", "URL", "Paste Data", "Sample Data"])

            if source == "File Upload":
                uploaded = st.file_uploader("Choose file", type=['csv', 'xlsx', 'xls', 'json', 'txt', 'pdf'])
                if uploaded:
                    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=Path(uploaded.name).suffix)
                    tmp.write(uploaded.getvalue())
                    tmp_path = tmp.name
                    try:
                        # Use cached loader for large files
                        loaded = load_cached_file(tmp_path)
                        self.current_data = loaded.get('data', loaded)
                        st.session_state['show_dialog'] = False  # close dialog
                        st.success("Data loaded!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"Failed to load file: {e}")

            elif source == "URL":
                url = st.text_input("Enter URL")
                if st.button("Load URL", key="load_url"):
                    try:
                        resp = requests.get(url)
                        if resp.status_code == 200:
                            if url.endswith('.csv'):
                                self.current_data = pd.read_csv(io.StringIO(resp.text))
                            else:
                                self.current_data = resp.json()
                            st.session_state['show_dialog'] = False
                            st.success("Loaded from URL!")
                            st.rerun()
                        else:
                            st.error(f"HTTP {resp.status_code}")
                    except Exception as e:
                        st.error(f"Error: {e}")

            elif source == "Paste Data":
                pasted = st.text_area("Paste CSV/JSON", height=150)
                if st.button("Parse Pasted", key="parse_pasted"):
                    try:
                        self.current_data = pd.read_csv(io.StringIO(pasted))
                    except:
                        try:
                            self.current_data = json.loads(pasted)
                        except:
                            self.current_data = pasted
                    st.session_state['show_dialog'] = False
                    st.success("Parsed!")
                    st.rerun()

            elif source == "Sample Data":
                sample = st.selectbox("Sample", ["Iris", "Titanic"])
                if st.button("Load Sample", key="load_sample"):
                    if sample == "Iris":
                        from sklearn.datasets import load_iris
                        iris = load_iris()
                        self.current_data = pd.DataFrame(iris.data, columns=iris.feature_names)
                        self.current_data['target'] = iris.target
                    elif sample == "Titanic":
                        self.current_data = pd.read_csv("https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv")
                    st.session_state['show_dialog'] = False
                    st.success("Loaded sample!")
                    st.rerun()

            # Close button (optional)
            if st.button("Close Dialog", key="close_load_dialog"):
                st.session_state['show_dialog'] = False
                st.rerun()

    def data_explorer(self):
        if self.current_data is None:
            st.info("Load data first")
            return
        if isinstance(self.current_data, pd.DataFrame):
            df = self.current_data
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Rows", len(df))
            with col2:
                st.metric("Columns", len(df.columns))
            with col3:
                st.metric("Memory", f"{df.memory_usage(deep=True).sum() / 1024**2:.2f} MB")
            with col4:
                st.metric("Missing", df.isnull().sum().sum())

            view = st.selectbox("View", ["Head", "Tail", "Sample", "Full"])
            n = st.slider("Rows", 5, 100, 10)
            if view == "Head":
                st.dataframe(df.head(n))
            elif view == "Tail":
                st.dataframe(df.tail(n))
            elif view == "Sample":
                st.dataframe(df.sample(min(n, len(df))))
            else:
                st.dataframe(df)

            col = st.selectbox("Column stats", df.columns)
            if col:
                if pd.api.types.is_numeric_dtype(df[col]):
                    st.dataframe(df[col].describe())
                    fig = px.histogram(df, x=col)
                    st.plotly_chart(fig)
                else:
                    st.dataframe(df[col].value_counts().head(20))
        else:
            st.json(self.current_data)

    def quick_actions(self):
        if self.current_data is None or not isinstance(self.current_data, pd.DataFrame):
            st.warning("Load a DataFrame first")
            return

        df = self.current_data.copy()
        c1, c2, c3 = st.columns(3)

        with c1:
            st.subheader("🧹 Clean")
            if st.button("Remove Duplicates", key="q_remove_dup"):
                before = len(df)
                df = df.drop_duplicates()
                self.current_data = df
                st.success(f"Removed {before - len(df)} duplicates")
            if st.button("Drop All Nulls", key="q_drop_nulls"):
                before = len(df)
                df = df.dropna()
                self.current_data = df
                st.success(f"Dropped {before - len(df)} rows")
            if st.button("Trim Whitespace", key="q_trim"):
                for col in df.select_dtypes(include=['object']):
                    df[col] = df[col].str.strip()
                self.current_data = df
                st.success("Trimmed whitespace")

        with c2:
            st.subheader("🔄 Transform")
            if st.button("Standardize Text (lower)", key="q_lower"):
                for col in df.select_dtypes(include=['object']):
                    df[col] = df[col].str.lower()
                self.current_data = df
                st.success("Lowercased")
            if st.button("Scale Numeric", key="q_scale"):
                from sklearn.preprocessing import StandardScaler
                num = df.select_dtypes(include=[np.number])
                scaler = StandardScaler()
                df[num.columns] = scaler.fit_transform(num)
                self.current_data = df
                st.success("Scaled")
            if st.button("Encode Categorical", key="q_encode"):
                for col in df.select_dtypes(include=['object']):
                    df[col] = df[col].astype('category').cat.codes
                self.current_data = df
                st.success("Encoded")

        with c3:
            st.subheader("📊 Custom")
            query = st.text_input("Filter (pandas query)", placeholder="age > 30", key="q_filter_input")
            if query and st.button("Apply Filter", key="q_apply_filter"):
                try:
                    df = df.query(query)
                    self.current_data = df
                    st.success(f"Filtered to {len(df)} rows")
                except Exception as e:
                    st.error(e)
            cols = st.multiselect("Select columns", df.columns.tolist(), key="q_col_select")
            if cols and st.button("Keep Selected", key="q_keep_cols"):
                df = df[cols]
                self.current_data = df
                st.success(f"Kept {len(cols)} columns")

    def custom_rules(self):
        st.header("📈 Custom Rules")
        with st.expander("Create New Rule", expanded=True):
            name = st.text_input("Rule Name", key="rule_name")
            rtype = st.selectbox("Type", ["Column Operation", "Row Filter", "Value Mapping", "Custom Function"], key="rule_type")

            if rtype == "Column Operation":
                col = st.text_input("Column", key="rule_col")
                op = st.selectbox("Operation", ["Multiply", "Divide", "Add", "Subtract", "Power", "Log", "Square Root", "Custom"], key="rule_op")
                if op != "Custom":
                    val = st.number_input("Value", key="rule_val")
                else:
                    formula = st.text_area("Formula (use 'x')", placeholder="x**2+3*x+1", key="rule_formula")
                if st.button("Add Column Operation", key="add_col_op"):
                    def col_rule(df):
                        if col not in df.columns:
                            return df
                        if op == "Multiply":
                            df[col] *= val
                        elif op == "Divide":
                            df[col] = df[col] / val if val != 0 else df[col]
                        elif op == "Add":
                            df[col] += val
                        elif op == "Subtract":
                            df[col] -= val
                        elif op == "Power":
                            df[col] **= val
                        elif op == "Log":
                            df[col] = np.log(df[col] + 1)
                        elif op == "Square Root":
                            df[col] = np.sqrt(df[col] + 1)
                        elif op == "Custom" and formula:
                            df[col] = df[col].apply(lambda x: eval(formula))
                        return df
                    self.engine.add_custom_function(name, col_rule, "Column op")
                    self.engine.save_state()
                    st.success(f"Added {name}")

            elif rtype == "Row Filter":
                cond = st.text_area("Condition", placeholder="age > 30 and salary < 100000", key="rule_cond")
                if st.button("Add Row Filter", key="add_row_filter"):
                    def filter_rule(df):
                        try:
                            return df.query(cond)
                        except:
                            return df
                    self.engine.add_custom_function(name, filter_rule, "Row filter")
                    self.engine.save_state()
                    st.success(f"Added {name}")

            elif rtype == "Value Mapping":
                col = st.text_input("Column", key="map_col")
                mapping_input = st.text_area("Mapping (key:value per line)", placeholder="1: Yes\n0: No", key="map_input")
                if st.button("Add Value Mapping", key="add_map"):
                    mapping = {}
                    for line in mapping_input.strip().split('\n'):
                        if ':' in line:
                            k, v = line.split(':', 1)
                            mapping[k.strip()] = v.strip()
                    def map_rule(df):
                        if col in df.columns:
                            df[col] = df[col].map(mapping).fillna(df[col])
                        return df
                    self.engine.add_custom_function(name, map_rule, "Value mapping")
                    self.engine.save_state()
                    st.success(f"Added {name}")

            elif rtype == "Custom Function":
                code = st.text_area("Python Function", height=150,
                                    placeholder="def my_func(df):\n    df['new']=df['a']+df['b']\n    return df",
                                    key="custom_func_code")
                if st.button("Add Custom Function", key="add_custom_func"):
                    try:
                        local = {}
                        exec(code, globals(), local)
                        for n, obj in local.items():
                            if callable(obj) and n != 'builtins':
                                # Pass the code string to store it
                                self.engine.add_custom_function(name, obj, "Custom", code)
                                self.engine.save_state()
                                st.success(f"Added {name}")
                                break
                    except Exception as e:
                        st.error(e)

        st.subheader("Current Rules")
        if self.engine.user_functions:
            # Display rules with delete buttons
            for name, info in list(self.engine.user_functions.items()):
                col1, col2, col3 = st.columns([3, 2, 1])
                with col1:
                    st.write(f"**{name}**")
                with col2:
                    st.caption(info.get('description', ''))
                with col3:
                    if st.button("🗑️ Delete", key=f"del_{name}"):
                        del self.engine.user_functions[name]
                        self.engine.save_state()
                        st.success(f"Deleted rule: {name}")
                        st.rerun()
            # Apply all rules button
            if st.button("Apply All Rules to Data", key="apply_rules"):
                if self.current_data is not None:
                    df = self.current_data
                    for name, info in self.engine.user_functions.items():
                        try:
                            df = info['function'](df)
                            st.success(f"Applied {name}")
                        except Exception as e:
                            st.error(f"Error in {name}: {e}")
                    self.current_data = df
                    st.success("All applied!")
        else:
            st.info("No custom rules")

    def history_view(self):
        st.header("📜 History")
        history = self.engine.get_execution_history()
        if not history:
            st.info("No history")
        else:
            st.dataframe(pd.DataFrame(history))

    def pipeline_manager(self):
        with st.expander("📁 Pipeline Manager", expanded=True):
            for name, p in list(self.engine.pipelines.items()):
                c1, c2, c3 = st.columns([2, 1, 1])
                with c1:
                    st.write(f"**{name}** (v{p.version}) - {len(p.steps)} steps")
                with c2:
                    if st.button("Load", key=f"load_{name}"):
                        st.session_state['active_pipeline'] = name
                        st.rerun()
                with c3:
                    if st.button("Delete", key=f"del_{name}"):
                        del self.engine.pipelines[name]
                        self.engine.save_state()
                        st.rerun()

            uploaded = st.file_uploader("Import Pipeline JSON", type=['json'], key="import_pipe")
            if uploaded:
                try:
                    pipe_dict = json.load(uploaded)
                    self.engine.import_pipeline(pipe_dict)
                    self.engine.save_state()
                    st.success(f"Imported {pipe_dict['name']}")
                    st.rerun()
                except Exception as e:
                    st.error(e)

            if st.button("Close", key="close_pipeline_manager"):
                st.session_state['show_pipeline_manager'] = False
                st.rerun()

    def custom_function_creator(self):
        with st.expander("🛠️ Custom Function Creator", expanded=True):
            name = st.text_input("Function Name", key="cf_name")
            desc = st.text_area("Description", key="cf_desc")
            params = st.text_input("Parameters (comma-separated)", placeholder="df, threshold, columns", key="cf_params")
            code = st.text_area("Function Code", height=200,
                                placeholder="def my_func(df, threshold=3):\n    return df",
                                key="cf_code")
            if st.button("Register Function", key="register_custom_func"):
                try:
                    local = {}
                    exec(code, globals(), local)
                    for n, obj in local.items():
                        if callable(obj) and n == name:
                            # Pass the code string to store it
                            self.engine.add_custom_function(name, obj, desc, code)
                            self.engine.save_state()
                            st.success(f"Registered {name}")
                            # Auto-close the modal and refresh
                            st.session_state['show_custom_function'] = False
                            st.rerun()
                            break
                    else:
                        st.warning(f"Function '{name}' not found")
                except Exception as e:
                    st.error(e)

            if st.button("Close", key="close_custom_function"):
                st.session_state['show_custom_function'] = False
                st.rerun()

    def export_tab(self):
        """Export the current dataset (DataFrame or splits) to various formats."""
        st.header("📤 Export Data")
        
        data = self.current_data
        if data is None:
            st.warning("No data to export. Load or prepare data first.")
            return

        # Determine what we have
        is_split_dict = isinstance(data, dict) and 'train' in data and 'val' in data and 'test' in data
        is_dataframe = isinstance(data, pd.DataFrame)

        if not is_split_dict and not is_dataframe:
            st.warning("Data is not in a downloadable format (not DataFrame or split dict).")
            return

        # Choose export format
        format_options = ["CSV", "Excel", "Parquet", "JSON"]
        selected_format = st.selectbox("Select export format", format_options, key="export_format")
        mime_types = {
            "CSV": "text/csv",
            "Excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Parquet": "application/octet-stream",
            "JSON": "application/json",
        }
        file_ext = {"CSV": "csv", "Excel": "xlsx", "Parquet": "parquet", "JSON": "json"}

        if is_dataframe:
            # Export the whole DataFrame
            st.subheader("Export Full Dataset")
            df = data
            # Generate download data
            try:
                if selected_format == "CSV":
                    output = df.to_csv(index=False).encode('utf-8')
                elif selected_format == "Excel":
                    output = io.BytesIO()
                    df.to_excel(output, index=False, engine='openpyxl')
                    output = output.getvalue()
                elif selected_format == "Parquet":
                    output = io.BytesIO()
                    df.to_parquet(output, index=False)
                    output = output.getvalue()
                elif selected_format == "JSON":
                    output = df.to_json(orient='records').encode('utf-8')
                st.download_button(
                    label=f"📥 Download Full Dataset as {selected_format}",
                    data=output,
                    file_name=f"full_dataset.{file_ext[selected_format]}",
                    mime=mime_types[selected_format],
                    key="download_full"
                )
            except Exception as e:
                st.error(f"Error generating download: {e}")

        elif is_split_dict:
            st.subheader("Export Train / Validation / Test Splits")
            for split_name in ['train', 'val', 'test']:
                df = data[split_name]
                try:
                    if selected_format == "CSV":
                        output = df.to_csv(index=False).encode('utf-8')
                    elif selected_format == "Excel":
                        output = io.BytesIO()
                        df.to_excel(output, index=False, engine='openpyxl')
                        output = output.getvalue()
                    elif selected_format == "Parquet":
                        output = io.BytesIO()
                        df.to_parquet(output, index=False)
                        output = output.getvalue()
                    elif selected_format == "JSON":
                        output = df.to_json(orient='records').encode('utf-8')
                    st.download_button(
                        label=f"📥 Download {split_name.capitalize()} set as {selected_format}",
                        data=output,
                        file_name=f"{split_name}_set.{file_ext[selected_format]}",
                        mime=mime_types[selected_format],
                        key=f"download_{split_name}"
                    )
                except Exception as e:
                    st.error(f"Error generating download for {split_name}: {e}")

        # Add a quick note about the data size
        if is_dataframe:
            st.caption(f"Dataset: {len(df)} rows × {len(df.columns)} columns")
        elif is_split_dict:
            st.caption(f"Train: {len(data['train'])} rows, Val: {len(data['val'])} rows, Test: {len(data['test'])} rows")

if __name__ == "__main__":
    app = FullControlDataPrepUI()
    app.run()