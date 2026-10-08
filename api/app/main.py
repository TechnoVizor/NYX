from fastapi import FastAPI

from app.routes import auth, health, scope

app = FastAPI(title="NYX API", version="0.1.0")
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(scope.router)
