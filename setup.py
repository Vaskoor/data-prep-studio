from setuptools import setup, find_packages
setup(name="data-prep-tool", version="1.0.0", packages=find_packages(),
      install_requires=['pandas>=2.0.0','numpy>=1.24.0','scikit-learn>=1.3.0','streamlit>=1.28.0','plotly>=5.17.0'],
      entry_points={'console_scripts': ['dataprep=src.cli.main:main']},
      python_requires='>=3.8')
