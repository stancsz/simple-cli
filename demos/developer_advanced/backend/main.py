from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello World"}

@app.get("/items/{item_id}")
def read_item(item_id: int):
    return {"item_id": item_id, "description": "This is a heavy item that needs rate limiting."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
