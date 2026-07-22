# 🧹 Universal Data Preparation Toolkit

> **A powerful, extensible, and fully customizable data preparation platform for cleaning, transforming, validating, and preprocessing any type of dataset.**

Whether you're preparing datasets for **Machine Learning, Data Science, Analytics, Business Intelligence, or AI applications**, this toolkit provides complete control over every preprocessing step through an intuitive visual interface, command-line tools, and a flexible Python API.

---

<p align="center">

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![Streamlit](https://img.shields.io/badge/Streamlit-Web_App-red?logo=streamlit)
![License](https://img.shields.io/badge/License-MIT-green)
![CLI](https://img.shields.io/badge/CLI-Supported-black)
![API](https://img.shields.io/badge/Python_API-Available-blue)
![Status](https://img.shields.io/badge/Status-Active-success)

</p>

---

# 📖 Overview

Preparing high-quality datasets is often the most time-consuming part of any AI or analytics project.

This project is designed to make data preprocessing **flexible, reproducible, and fully customizable**.

Instead of forcing users into predefined cleaning workflows, the toolkit allows you to:

- Design your own preprocessing pipelines
- Combine multiple transformations
- Write custom Python processing rules
- Execute workflows visually or programmatically
- Track execution history
- Roll back changes whenever needed

It works with structured, semi-structured, and unstructured data, making it suitable for almost any data engineering workflow.

---

# ✨ Features

## 🌍 Universal Data Loader

Supports **50+ file formats**, including:

### Structured Data

- CSV
- TSV
- Excel (.xlsx, .xls)
- JSON
- XML
- SQL dumps
- Parquet
- Feather

### Documents

- PDF
- DOCX
- TXT
- Markdown
- HTML

### Images

- PNG
- JPG
- JPEG
- TIFF
- BMP
- GIF

### Audio

- WAV
- MP3
- FLAC
- AAC

### Video

- MP4
- AVI
- MOV
- MKV

### AI Generated Data

- ChatGPT exports
- Claude conversations
- Gemini outputs
- Markdown datasets
- Prompt datasets
- LLM-generated JSON

---

## 🧹 Advanced Data Cleaning

Perform common and advanced preprocessing tasks with configurable parameters.

Supported operations include:

- Remove duplicate records
- Handle missing values
- Outlier detection
- Null replacement
- Invalid value correction
- Data normalization
- Standardization
- Type conversion
- Text cleaning
- Date parsing
- Encoding categorical variables
- Feature scaling
- Column renaming
- Data validation

---

## 🏗 Visual Pipeline Builder

Create complex preprocessing workflows visually.

Features include:

- Drag-and-drop pipeline editor
- Sequential processing
- Conditional execution
- Dependencies between steps
- Parameter customization
- Save reusable pipelines
- Import & export pipeline configurations

---

## ⚙ Fully Customizable Pipelines

Every processing step supports configurable parameters.

Example:

```text
Load CSV
      ↓
Remove Duplicates
      ↓
Handle Missing Values
      ↓
Normalize Columns
      ↓
Custom Python Rule
      ↓
Validate Dataset
      ↓
Export
```

---

## 🧩 Custom Python Rules

Need functionality beyond the built-in processors?

Write your own Python functions and plug them directly into the pipeline.

Example:

```python
def clean_sales_data(df):
    df["price"] = df["price"].fillna(0)
    df["discount"] = df["discount"].clip(0, 100)
    return df
```

---

## 🖥 Multiple Interfaces

Choose the interface that best suits your workflow.

### 🌐 Streamlit Web Application

- Interactive UI
- Upload datasets
- Build pipelines
- Execute processing
- Download results

---

### 💻 Command Line Interface

Ideal for automation and scripting.

Example:

```bash
python src/cli/main.py \
    --input data.csv \
    --steps remove_duplicates handle_missing \
    --output cleaned.csv
```

---

### 🐍 Python API

Integrate preprocessing directly into your own projects.

---

## 📜 Execution History

Every execution is logged.

Track:

- Pipeline used
- Parameters
- Processing steps
- Runtime
- Output
- Errors

---

## ↩ Rollback Support

Made a mistake?

Instantly restore previous versions of your processed datasets.

---

# 📂 Project Structure

```
.
├── src
│   ├── core
│   │   ├── loader
│   │   ├── cleaner
│   │   ├── transformer
│   │   ├── validator
│   │   └── pipeline_engine
│   │
│   ├── processors
│   │   ├── text
│   │   ├── ai_data
│   │   └── multimedia
│   │
│   ├── web
│   │   └── Streamlit application
│   │
│   └── cli
│       └── Command Line Interface
│
├── examples
│   ├── custom_pipelines
│   └── user_rules
│
├── requirements.txt
└── README.md
```

---

# 🚀 Installation

Clone the repository

```bash
git clone https://github.com/yourusername/data-preparation-toolkit.git

cd data-preparation-toolkit
```

Install dependencies

```bash
pip install -r requirements.txt
```

Download the required spaCy model

```bash
python -m spacy download en_core_web_sm
```

---

# ▶ Running the Web Application

Launch the Streamlit interface:

```bash
streamlit run src/web/app.py
```

Open your browser and navigate to:

```
http://localhost:8501
```

---

# 💻 Command Line Usage

## Basic Cleaning

```bash
python src/cli/main.py \
    --input data.csv \
    --steps remove_duplicates handle_missing \
    --output cleaned.csv
```

---

## Execute a Saved Pipeline

```bash
python src/cli/main.py \
    --input data.csv \
    --pipeline examples/custom_pipelines/advanced_cleaning.json
```

---

## Execute Custom Rules

```bash
python src/cli/main.py \
    --input data.csv \
    --custom-rules examples/user_rules/sales_cleaning.py \
    --steps clean_sales_data
```

---

# 🐍 Python API

```python
from core.pipeline_engine import PipelineEngine

engine = PipelineEngine()

pipeline = engine.create_pipeline("my_pipeline")

# Add processing steps...

result = engine.execute_pipeline(
    "my_pipeline",
    dataframe
)
```

---

# 🔄 Typical Workflow

```text
Load Dataset
      │
      ▼
Analyze Data
      │
      ▼
Create Pipeline
      │
      ▼
Configure Parameters
      │
      ▼
Execute Pipeline
      │
      ▼
Validate Output
      │
      ▼
Export Clean Dataset
```

---

# 🎯 Use Cases

- Machine Learning
- AI Dataset Preparation
- Data Engineering
- ETL Pipelines
- Data Analytics
- Business Intelligence
- Research
- NLP
- Computer Vision
- Large Language Model (LLM) Dataset Preparation

---

# 🔮 Roadmap

- [ ] Distributed processing
- [ ] Pipeline scheduling
- [ ] Cloud storage integration
- [ ] Hugging Face dataset support
- [ ] Apache Spark integration
- [ ] AI-assisted cleaning suggestions
- [ ] Pipeline templates marketplace
- [ ] Real-time collaborative editing
- [ ] Docker deployment
- [ ] REST API server

---

# 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push the branch
5. Open a Pull Request

---

# 📄 License

This project is licensed under the **MIT License**.

---

# ⭐ Support

If you find this project useful, consider giving it a ⭐ on GitHub.

It helps others discover the project and motivates future development.

---

## 💡 Built For

Researchers • Data Scientists • ML Engineers • AI Engineers • Data Engineers • Analysts • Developers
