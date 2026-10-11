import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role in ('admin', 'analyst', 'viewer')", name="users_role_check"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    password_hash: Mapped[str]
    role: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary(32), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScopeTarget(Base):
    __tablename__ = "scope_targets"
    __table_args__ = (
        CheckConstraint("kind in ('domain', 'cidr')", name="scope_targets_kind_check"),
        UniqueConstraint("kind", "value", name="scope_targets_kind_value_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(8))
    value: Mapped[str] = mapped_column(String(253))
    active_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    authorization: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Plugin(Base):
    __tablename__ = "plugins"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    publisher: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    categories: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    risk_level: Mapped[str] = mapped_column(String(16))
    trust_level: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class PluginVersion(Base):
    __tablename__ = "plugin_versions"
    __table_args__ = (UniqueConstraint("plugin_id", "version", "digest", name="plugin_versions_key"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_id: Mapped[str] = mapped_column(ForeignKey("plugins.id", ondelete="CASCADE"), index=True)
    version: Mapped[str] = mapped_column(String(40))
    image: Mapped[str] = mapped_column(String(200))
    digest: Mapped[str | None] = mapped_column(String(80))
    manifest: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PluginInstallation(Base):
    __tablename__ = "plugin_installations"

    plugin_id: Mapped[str] = mapped_column(ForeignKey("plugins.id", ondelete="CASCADE"), primary_key=True)
    plugin_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plugin_versions.id", ondelete="CASCADE"))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSONB, default=dict)


RUN_STATUSES = ("PENDING", "RUNNING", "SUCCEEDED", "FAILED", "TIMED_OUT", "CANCELLED")


class PluginRun(Base):
    __tablename__ = "plugin_runs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    plugin_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("plugin_versions.id", ondelete="CASCADE"), index=True
    )
    scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), index=True)
    targets: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(12), default="PENDING")
    attempt: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    exit_code: Mapped[int | None] = mapped_column(Integer)
    error: Mapped[str | None] = mapped_column(Text)
    event_count: Mapped[int] = mapped_column(Integer, default=0)


class PluginEvent(Base):
    __tablename__ = "plugin_events"

    run_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("plugin_runs.id", ondelete="CASCADE"), primary_key=True)
    seq: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict] = mapped_column(JSONB)
    valid: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


SCAN_STATUSES = ("CREATED", "RUNNING", "PAUSED", "COMPLETED", "PARTIAL", "FAILED", "CANCELLED")
SCAN_FINAL = ("COMPLETED", "PARTIAL", "FAILED", "CANCELLED")


class Scan(Base):
    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    root_target: Mapped[dict] = mapped_column(JSONB)
    plugin_ids: Mapped[list[str]] = mapped_column(ARRAY(String))
    max_depth: Mapped[int] = mapped_column(Integer, default=2, server_default="2")
    max_targets: Mapped[int] = mapped_column(Integer, default=5000, server_default="5000")
    status: Mapped[str] = mapped_column(String(12), default="CREATED")
    error: Mapped[str | None] = mapped_column(Text)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    plugin_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    profile_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scan_profiles.id", ondelete="SET NULL"))


class ScanTarget(Base):
    """Everything a scan considered: followed (in_scope) or not (refusal says why)."""

    __tablename__ = "scan_targets"

    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True)
    type: Mapped[str] = mapped_column(String(8), primary_key=True)
    value: Mapped[str] = mapped_column(String(2000), primary_key=True)
    depth: Mapped[int] = mapped_column(Integer)
    source_run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plugin_runs.id", ondelete="SET NULL"))
    in_scope: Mapped[bool] = mapped_column(Boolean)
    refusal: Mapped[str | None] = mapped_column(Text)
    routed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = (
        UniqueConstraint("kind", "value", name="assets_kind_value_key"),
        Index("ix_assets_last_seen", "last_seen"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    kind: Mapped[str] = mapped_column(String(32))
    value: Mapped[str] = mapped_column(String(2000))
    data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_scan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scans.id", ondelete="SET NULL"))


class Finding(Base):
    __tablename__ = "findings"
    __table_args__ = (
        CheckConstraint("severity in ('critical', 'high', 'medium', 'low', 'info')", name="findings_severity_check"),
        CheckConstraint(
            "status in ('open', 'confirmed', 'false_positive', 'accepted_risk', 'fixed')", name="findings_status_check"
        ),
        Index("ix_findings_severity", "severity"),
        Index("ix_findings_status", "status"),
        Index("ix_findings_last_seen", "last_seen"),
        Index("ix_findings_asset_id", "asset_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    fingerprint: Mapped[str] = mapped_column(String(64), unique=True)
    plugin_id: Mapped[str] = mapped_column(String(120))
    template_id: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(8))
    matched_at: Mapped[str] = mapped_column(String(2000))
    asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("assets.id", ondelete="SET NULL"))
    data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    status: Mapped[str] = mapped_column(String(16), default="open", server_default="open")
    status_note: Mapped[str | None] = mapped_column(Text)
    status_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class FindingOccurrence(Base):
    __tablename__ = "finding_occurrences"
    __table_args__ = (Index("ix_finding_occurrences_scan_id", "scan_id"),)

    finding_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("findings.id", ondelete="CASCADE"), primary_key=True)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), primary_key=True)
    run_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("plugin_runs.id", ondelete="SET NULL"))
    event_seq: Mapped[int | None] = mapped_column(Integer)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScanProfile(Base):
    __tablename__ = "scan_profiles"
    __table_args__ = (CheckConstraint("max_depth between 1 and 3", name="scan_profiles_depth_check"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    name: Mapped[str] = mapped_column(String(80), unique=True)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    builtin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    plugin_ids: Mapped[list[str]] = mapped_column(ARRAY(String))
    plugin_config: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    max_depth: Mapped[int] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
