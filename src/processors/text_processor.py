import re, string
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer, PorterStemmer
import spacy
import textblob
from typing import Dict, Any, List, Optional
import numpy as np

class TextProcessor:
    def __init__(self, text: str):
        self.text=text
        self.stop_words=set(stopwords.words('english'))
        self.lemmatizer=WordNetLemmatizer()
        self.stemmer=PorterStemmer()
        try: self.nlp=spacy.load('en_core_web_sm')
        except: self.nlp=None
    def process(self, **kwargs) -> Dict[str,Any]:
        return {'original':self.text,'cleaned':self._clean_text(),'tokens':self._tokenize(),
                'sentences':self._split_sentences(),'entities':self._extract_entities(),
                'sentiment':self._analyze_sentiment(),'keywords':self._extract_keywords(),
                'statistics':self._get_statistics(),'language':self._detect_language(),
                'embeddings':self._generate_embeddings() if kwargs.get('generate_embeddings',False) else None}
    def _clean_text(self):
        t=re.sub(r'[^\w\s.]',' ',self.text); return ' '.join(t.split()).lower()
    def _tokenize(self): return word_tokenize(self.text)
    def _split_sentences(self): return sent_tokenize(self.text)
    def _extract_entities(self):
        entities=[]
        if self.nlp:
            doc=self.nlp(self.text)
            for ent in doc.ents:
                entities.append({'text':ent.text,'label':ent.label_,'start':ent.start_char,'end':ent.end_char})
        return entities
    def _analyze_sentiment(self):
        blob=textblob.TextBlob(self.text)
        return {'polarity':blob.sentiment.polarity,'subjectivity':blob.sentiment.subjectivity,
                'sentiment_class':'positive' if blob.sentiment.polarity>0.1 else 'negative' if blob.sentiment.polarity<-0.1 else 'neutral'}
    def _extract_keywords(self):
        words=[w for w in word_tokenize(self.text.lower()) if w not in self.stop_words and w not in string.punctuation]
        freq={}
        for w in words: freq[w]=freq.get(w,0)+1
        return [w for w,_ in sorted(freq.items(), key=lambda x:x[1], reverse=True)[:10]]
    def _get_statistics(self):
        words=word_tokenize(self.text); chars=len(self.text); sents=len(sent_tokenize(self.text))
        return {'word_count':len(words),'char_count':chars,'sentence_count':sents,
                'avg_word_length':chars/len(words) if words else 0,
                'avg_sentence_length':len(words)/sents if sents else 0}
    def _detect_language(self):
        try:
            from langdetect import detect
            return detect(self.text)
        except: return 'unknown'
    def _generate_embeddings(self):
        try:
            from sentence_transformers import SentenceTransformer
            model=SentenceTransformer('all-MiniLM-L6-v2')
            return model.encode(self.text)
        except: return np.array([])
