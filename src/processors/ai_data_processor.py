import json, re, io
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional

class AIDataProcessor:
    def __init__(self):
        self.patterns=self._init_patterns()
    def _init_patterns(self):
        return {
            'json_array': re.compile(r'^\[.*\]$', re.DOTALL),
            'json_object': re.compile(r'^\{.*\}$', re.DOTALL),
            'markdown_table': re.compile(r'\|.*\|'),
            'code_block': re.compile(r'```.*?```', re.DOTALL),
            'latex': re.compile(r'\$.*?\$', re.DOTALL),
            'bullets': re.compile(r'^[\s]*[-*•][\s]+', re.MULTILINE),
            'numbered_list': re.compile(r'^[\s]*\d+\.', re.MULTILINE),
            'csv_rows': re.compile(r'^.*,.*$', re.MULTILINE),
        }
    def process_ai_data(self, ai_output: str) -> Dict[str,Any]:
        result={'raw':ai_output,'parsed_data':[],'code_blocks':[],'tables':[],'metadata':{},
                'structure_type':self._detect_structure(ai_output)}
        if result['structure_type']=='json': result['parsed_data']=self._parse_json_like(ai_output)
        elif result['structure_type']=='table': result['tables']=self._parse_tables(ai_output)
        elif result['structure_type']=='mixed':
            result['code_blocks']=self._extract_code_blocks(ai_output)
            result['tables']=self._parse_tables(ai_output)
            structured=self._extract_structured_data(ai_output)
            if structured: result['parsed_data']=structured
        result['metadata']=self._extract_metadata(ai_output)
        return result
    def _detect_structure(self, text):
        text=text.strip()
        if text.startswith('{') and text.endswith('}'): return 'json'
        if text.startswith('[') and text.endswith(']'): return 'json_array'
        if '|' in text and '-|' in text: return 'table'
        if '```' in text: return 'mixed'
        lines=text.split('\n')
        if len(lines)>1 and ',' in lines[0] and ',' in lines[1]: return 'tabular'
        return 'text'
    def _parse_json_like(self, text):
        try:
            m=re.search(r'```json\s*(.*?)\s*```', text, re.DOTALL)
            if m: text=m.group(1)
            data=json.loads(text)
            return data if isinstance(data, list) else [data]
        except:
            try:
                text=re.sub(r'```.*?\n','',text); text=re.sub(r'```','',text); text=text.strip()
                data=json.loads(text)
                return data if isinstance(data, list) else [data]
            except: return []
    def _parse_tables(self, text):
        tables=[]
        lines=text.split('\n')
        table_lines=[]; in_table=False
        for line in lines:
            if '|' in line:
                if not in_table: in_table=True; table_lines=[]
                table_lines.append(line)
            elif in_table and line.strip()=='':
                if table_lines:
                    df=self._parse_markdown_table(table_lines)
                    if not df.empty: tables.append(df)
                in_table=False; table_lines=[]
        # CSV
        csv_matches=re.findall(r'^[^,]+,[^,]+[,]?.*$', text, re.MULTILINE)
        if len(csv_matches)>2:
            try:
                df=pd.read_csv(io.StringIO('\n'.join(csv_matches)))
                if not df.empty: tables.append(df)
            except: pass
        return tables
    def _parse_markdown_table(self, lines):
        try:
            data_lines=[l for l in lines if not re.match(r'^[\s\|: -]+$', l)]
            if len(data_lines)<2: return pd.DataFrame()
            rows=[]
            for line in data_lines:
                cells=[c.strip() for c in line.split('|') if c.strip()]
                rows.append(cells)
            if rows: return pd.DataFrame(rows[1:], columns=rows[0])
            return pd.DataFrame()
        except: return pd.DataFrame()
    def _extract_code_blocks(self, text):
        blocks=[]
        for lang, code in re.findall(r'```(\w+)?\s*\n(.*?)\n```', text, re.DOTALL):
            blocks.append({'language':lang or 'unknown','code':code.strip()})
        return blocks
    def _extract_structured_data(self, text):
        structured=[]
        kv=re.findall(r'^[\s]*([^:]+):\s*(.+)$', text, re.MULTILINE)
        if kv:
            d={}
            for k,v in kv: d[k.strip()]=v.strip()
            structured.append(d)
        bullets=re.findall(r'^[\s]*[-*•][\s]+(.+)$', text, re.MULTILINE)
        if bullets:
            for b in bullets: structured.append({'bullet_point':b})
        return structured
    def _extract_metadata(self, text):
        meta={}
        nums=re.findall(r'\b\d+\b', text)
        if nums: meta['numbers_found']=len(nums); meta['first_number']=nums[0]
        urls=re.findall(r'https?://[^\s]+', text)
        if urls: meta['urls']=urls
        emails=re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        if emails: meta['emails']=emails
        meta['word_count']=len(text.split())
        return meta
