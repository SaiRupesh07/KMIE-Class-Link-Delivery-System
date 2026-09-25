from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()

    # Create PostgreSQL enum types exactly once.
    postgresql.ENUM(
        "STAFF",
        "REVIEWER",
        "STUDENT",
        name="user_role",
    ).create(bind, checkfirst=True)

    postgresql.ENUM(
        "LIVE",
        "RECORDED",
        name="session_type",
    ).create(bind, checkfirst=True)

    postgresql.ENUM(
        "DRAFT",
        "APPROVED",
        name="session_status",
    ).create(bind, checkfirst=True)

    postgresql.ENUM(
        "PRESENT",
        "ABSENT",
        name="attendance_status",
    ).create(bind, checkfirst=True)

    postgresql.ENUM(
        "PENDING",
        "SENT",
        "FAILED",
        name="delivery_status",
    ).create(bind, checkfirst=True)

    # Reusable enum objects for table columns.
    role_type = postgresql.ENUM(
        "STAFF",
        "REVIEWER",
        "STUDENT",
        name="user_role",
        create_type=False,
    )

    session_type = postgresql.ENUM(
        "LIVE",
        "RECORDED",
        name="session_type",
        create_type=False,
    )

    session_status = postgresql.ENUM(
        "DRAFT",
        "APPROVED",
        name="session_status",
        create_type=False,
    )

    attendance_status = postgresql.ENUM(
        "PRESENT",
        "ABSENT",
        name="attendance_status",
        create_type=False,
    )

    delivery_status = postgresql.ENUM(
        "PENDING",
        "SENT",
        "FAILED",
        name="delivery_status",
        create_type=False,
    )

    op.create_table(
        "batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "students",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column(
            "batch_id",
            sa.String(36),
            sa.ForeignKey("batches.id"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", role_type, nullable=False),
        sa.Column(
            "student_id",
            sa.String(36),
            sa.ForeignKey("students.id"),
            unique=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "batch_id",
            sa.String(36),
            sa.ForeignKey("batches.id"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("type", session_type, nullable=False),
        sa.Column("time", sa.Time(), nullable=False),
        sa.Column("zoom_url", sa.String(500), nullable=False),
        sa.Column("status", session_status, nullable=False),
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "approved_by",
            sa.String(36),
            sa.ForeignKey("users.id"),
        ),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "batch_id",
            "date",
            "type",
            name="uq_session_batch_date_type",
        ),
    )

    op.create_table(
        "attendance",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "student_id",
            sa.String(36),
            sa.ForeignKey("students.id"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column("status", attendance_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "student_id",
            "session_id",
            name="uq_attendance_student_session",
        ),
    )

    op.create_table(
        "link_deliveries",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "student_id",
            sa.String(36),
            sa.ForeignKey("students.id"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("sessions.id"),
            nullable=False,
        ),
        sa.Column("status", delivery_status, nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "student_id",
            "session_id",
            name="uq_delivery_student_session",
        ),
    )


def downgrade():
    op.drop_table("link_deliveries")
    op.drop_table("attendance")
    op.drop_table("sessions")
    op.drop_table("users")
    op.drop_table("students")
    op.drop_table("batches")

    bind = op.get_bind()

    postgresql.ENUM(name="delivery_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="attendance_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="session_status").drop(bind, checkfirst=True)
    postgresql.ENUM(name="session_type").drop(bind, checkfirst=True)
    postgresql.ENUM(name="user_role").drop(bind, checkfirst=True)