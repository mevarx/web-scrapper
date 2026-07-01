from abc import ABC, abstractmethod
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class RawResult(BaseModel):
    title: str
    url: str
    body: str
    author: str
    score: float
    created_at: datetime
    source_name: str

class SourceAdapter(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Name of the source (e.g. 'reddit', 'stackoverflow')"""
        pass

    @abstractmethod
    def is_configured(self) -> bool:
        """Check if source has proper keys configured in settings"""
        pass

    @abstractmethod
    async def test_connection(self) -> bool:
        """Test authentication or network connectivity to endpoint"""
        pass

    @abstractmethod
    async def search(self, query: str, limit: int = 10) -> List[RawResult]:
        """Perform search query and return raw results"""
        pass
