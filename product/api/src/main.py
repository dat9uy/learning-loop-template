from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.fundamental import router as fundamental_router
from .routers.reference import router as reference_router


def create_app() -> FastAPI:
    app = FastAPI(title="Learning Loop Reference API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(reference_router)
    app.include_router(fundamental_router)
    return app


app = create_app()
