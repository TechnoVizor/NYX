from typing import Literal

from pydantic import BaseModel, Field


class Target(BaseModel):
    type: Literal["domain", "ip", "cidr", "url"]
    value: str = Field(min_length=1, max_length=2000)
