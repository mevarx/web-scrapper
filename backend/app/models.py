from sqlalchemy import Column, String, Integer, DateTime, Text
from datetime import datetime
from .db import Base

class RawCache(Base):
    __tablename__ = "raw_cache"

    id = Column(Integer, primary_key=True, index=True)
    query_hash = Column(String, index=True)
    source_name = Column(String, index=True)
    results_json = Column(Text)  # Serialized list of RawResult
    fetched_at = Column(DateTime, default=datetime.utcnow)

class AnswerCache(Base):
    __tablename__ = "answer_cache"

    id = Column(Integer, primary_key=True, index=True)
    query_hash = Column(String, index=True)  # Hash of normalized_query + enabled_sources
    query_text = Column(String)
    answer_text = Column(Text)
    citations_json = Column(Text)  # Serialized list of Citations
    raw_results_json = Column(Text)  # Serialized top ranked RawResults
    fetched_at = Column(DateTime, default=datetime.utcnow)
