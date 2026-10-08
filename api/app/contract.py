"""The plugin contract: manifest and event schemas from plugins/schemas, checked with jsonschema."""

import json
from functools import cache
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker

from app.config import settings


@cache
def _validator(name: str) -> Draft202012Validator:
    schema = json.loads((Path(settings.plugins_dir) / "schemas" / f"{name}.schema.json").read_text())
    return Draft202012Validator(schema, format_checker=FormatChecker())


def _errors(name: str, doc: object) -> list[str]:
    return [
        f"{'/'.join(map(str, e.absolute_path)) or '(root)'}: {e.message}" for e in _validator(name).iter_errors(doc)
    ]


def validate_manifest(doc: object) -> list[str]:
    return _errors("manifest", doc)


def validate_event(doc: object) -> list[str]:
    return _errors("event", doc)


def load_manifest(path: Path) -> dict:
    return yaml.safe_load(path.read_text(encoding="utf-8"))
