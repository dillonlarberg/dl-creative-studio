import os
import requests
import json
import pandas as pd

# Unified Data API (UDA) v2.1 Configuration
AUTH_HOST = "login.alliplatform.com"
UDA_API_HOST = "dataexplorer.alliplatform.com"

# Credentials from environment or defaults 
CLIENT_ID = ## get this from the Alli platform  
CLIENT_SECRET = ## get this from the Alli platform
CLIENT_SLUG = ## get this from the Alli platform

DATA_DIR = "/Users/dillonlarberg/Desktop/Dillon/projects/beats/organic_performance/data"

def get_token():
    url = f"https://{AUTH_HOST}/token"
    payload = {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type": "client_credentials",
        "scope": "central.read"
    }
    response = requests.post(url, data=payload)
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Failed to get token: {response.status_code} - {response.text}")
        return None

def fetch_model_metadata(token, model_name):
    url = f"https://{UDA_API_HOST}/api/v2/clients/{CLIENT_SLUG}/models/{model_name}"
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    return None

def fetch_sample_data(token, model_name, dimensions, measures):
    url = f"https://{UDA_API_HOST}/api/v2/clients/{CLIENT_SLUG}/models/{model_name}/execute-query"
    headers = {
        "Authorization": f"Bearer {token}", 
        "Accept": "text/csv",
        "Content-Type": "application/json"
    }
    
    query = {
        "dimensions": dimensions, 
        "measures": measures,
        "limit": 5
    }
    
    response = requests.post(url, headers=headers, json=query)
    if response.status_code == 200:
        return response.text # Return raw CSV text
    else:
        print(f"Query failed for {model_name}: {response.status_code} - {response.text[:200]}")
        return None

def main():
    token = get_token()
    if not token:
        print("Failed to get token")
        return

    models = ["organic_instagram", "organic_tiktok", "organic_tiktok_video"]
    schema_map = "# Beats Organic Performance: Schema Map\n\n"

    for model in models:
        print(f"Processing model: {model}")
        metadata = fetch_model_metadata(token, model)
        if metadata:
            dims = [d['name'] for d in metadata.get('dimensions', [])]
            meas = [m['name'] for m in metadata.get('measures', [])]
            
            schema_map += f"## Model: {model}\n"
            schema_map += "### Dimensions\n"
            schema_map += "- " + "\n- ".join(dims) + "\n\n"
            schema_map += "### Measures\n"
            schema_map += "- " + "\n- ".join(meas) + "\n\n"
            
            # Sample Data
            sample_data_csv = fetch_sample_data(token, model, dims, meas)
            if sample_data_csv:
                with open(f"{DATA_DIR}/{model}_sample.csv", "w") as f:
                    f.write(sample_data_csv)
                print(f"Saved sample for {model}")
        else:
            print(f"Failed to fetch metadata for {model}")

    with open(f"{DATA_DIR}/schema_map.md", "w") as f:
        f.write(schema_map)
    print("Created schema_map.md")

if __name__ == "__main__":
    main()
