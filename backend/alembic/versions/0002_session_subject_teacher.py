from alembic import op
import sqlalchemy as sa

revision = "0002_session_subject_teacher"
down_revision = "0001_initial"
branch_labels = None
depends_on = None

# Demo/default values used to backfill existing rows that predate these
# columns, so the subsequent NOT NULL constraint can be applied safely.
_DEFAULT_SUBJECT_NAME = "Chemistry"
_DEFAULT_TEACHER_NAME = "Dr. Ravi Kumar"


def upgrade():
    bind = op.get_bind()

    # Step 1 & 2: add both columns as nullable first so the ALTER TABLE
    # succeeds even though the sessions table already has rows.
    op.add_column(
        "sessions",
        sa.Column("subject_name", sa.String(200), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("teacher_name", sa.String(200), nullable=True),
    )

    # Step 3: backfill existing rows with safe demo/default values.
    sessions = sa.table(
        "sessions",
        sa.column("subject_name", sa.String),
        sa.column("teacher_name", sa.String),
    )
    op.execute(
        sessions.update()
        .where(sessions.c.subject_name.is_(None))
        .values(subject_name=_DEFAULT_SUBJECT_NAME)
    )
    op.execute(
        sessions.update()
        .where(sessions.c.teacher_name.is_(None))
        .values(teacher_name=_DEFAULT_TEACHER_NAME)
    )

    # Step 4: now that every row has a value, enforce NOT NULL.
    op.alter_column("sessions", "subject_name", nullable=False)
    op.alter_column("sessions", "teacher_name", nullable=False)


def downgrade():
    op.drop_column("sessions", "teacher_name")
    op.drop_column("sessions", "subject_name")