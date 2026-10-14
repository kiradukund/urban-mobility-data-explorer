from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # lets the frontend on another port call this API


@app.route("/api/health")
def health():
    """Simple check that the API is running"""
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=3000)
