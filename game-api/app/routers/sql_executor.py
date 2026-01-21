"""
Temporary router for executing SQL scripts
⚠️ DEVELOPMENT ONLY - Remove in production
"""
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.deps import get_db

router = APIRouter(prefix="/sql", tags=["sql-executor"])


class SQLExecuteRequest(BaseModel):
    sql: str


class SQLExecuteResponse(BaseModel):
    success: bool
    message: str
    rows_affected: int | None = None
    results: list | None = None


@router.post("/execute", response_model=SQLExecuteResponse)
def execute_sql(
    payload: SQLExecuteRequest,
    db: Session = Depends(get_db),
):
    """
    Execute raw SQL on the database
    ⚠️ DANGER: This endpoint can execute ANY SQL
    Only use in development for schema initialization
    """
    try:
        # Execute the SQL
        result = db.execute(text(payload.sql))
        db.commit()

        # Try to fetch results if it's a SELECT
        try:
            rows = result.fetchall()
            return SQLExecuteResponse(
                success=True,
                message="SQL executed successfully",
                rows_affected=result.rowcount,
                results=[dict(row._mapping) for row in rows] if rows else None
            )
        except Exception:
            # Not a SELECT query, no results to fetch
            return SQLExecuteResponse(
                success=True,
                message="SQL executed successfully",
                rows_affected=result.rowcount
            )

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"SQL execution failed: {str(e)}"
        )


@router.get("/health")
def sql_executor_health():
    """Health check for SQL executor"""
    return {
        "status": "ready",
        "warning": "This is a development-only endpoint"
    }
