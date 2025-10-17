import pandas as pd
import requests
from tqdm import tqdm
import time
import random

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

def parser_details_product(json):
    d = dict()
    d['productId'] = json.get('id')
    d['name'] = json.get('name')
    d['slug'] = json.get('url_key')
    d['sku'] = json.get('sku')  

    # Ảnh
    images_array = json.get('images') or []
    d['images'] = [img.get('base_url') for img in images_array if img.get('base_url')]

     # category mapping từ breadcrumbs
    breadcrumbs = json.get("breadcrumbs", [])
    if len(breadcrumbs) >= 1:
        # Category cấp 1
        d["category"] = str(breadcrumbs[0].get("category_id", ""))
        d["categoryId"] = str(breadcrumbs[0].get("category_id", ""))
        d["categoryName"] = breadcrumbs[0].get("name", "")
        d["categorySlug"] = (
            breadcrumbs[0].get("url", "").split("/")[1] if breadcrumbs[0].get("url") else ""
        )
    if len(breadcrumbs) >= 2:
        # Category cấp 2
        d["subCategoryId"] = str(breadcrumbs[1].get("category_id", ""))
        d["subCategoryName"] = breadcrumbs[1].get("name", "")
        d["subCategorySlug"] = (
            breadcrumbs[1].get("url", "").split("/")[1] if breadcrumbs[1].get("url") else ""
        )
    if len(breadcrumbs) >= 3:
        # Category cấp 3
        third_name = breadcrumbs[2].get("name", "")
        # ❌ Nếu trùng với tên product thì bỏ qua
        if third_name != d["name"]:
            d["thirdSubCategoryId"] = str(breadcrumbs[2].get("category_id", ""))
            d["thirdSubCategoryName"] = third_name
            d["thirdSubCategorySlug"] = (
                breadcrumbs[2].get("url", "").split("/")[1] if breadcrumbs[2].get("url") else ""
            )

    # Mô tả
    d['description'] = json.get('description')
    d['short_description'] = json.get('short_description')

    # Brand
    brand_obj = json.get('brand') or {}
    d['brand'] = brand_obj.get('name')

    # Giá
    d['oldPrice'] = json.get('original_price')
    d['discount'] = json.get('discount_rate')
    d['price'] = json.get('price')

    # Review, rating
    d['averageRating'] = json.get('rating_average', 0)
    d['reviewCount'] = json.get('review_count', 0)
    
    # Tồn kho
    stock_obj = json.get('stock_item') or {}
    d['countInStock'] = stock_obj.get('qty', 0)
    # Số lượng bán
    quantity_sold_obj = json.get('quantity_sold') or {}
    d['quantitySold'] = quantity_sold_obj.get('value', 0)


    d['isFeatured'] = True
    d['isPublished'] = True
    # Lấy size
    configurable_options = json.get('configurable_options') or []
    size_option = next((opt for opt in configurable_options if opt.get('name') == "Chọn Size"), None)
    if size_option:
        d['productSize'] = [v.get('label') for v in size_option.get('values', [])]
    else:
        d['productSize'] = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL']
    
    return d

# Main
df_id = pd.read_csv('crawl_data/product_id_ncds.csv')
p_ids = df_id.id.to_list()
result = []

for pid in tqdm(p_ids, total=len(p_ids)):
    url = f"https://tiki.vn/api/v2/products/{pid}"
    response = requests.get(url, headers=headers, params={"platform": "web"})
    if response.status_code == 200:
        print(f"Crawl {pid} success")
        result.append(parser_details_product(response.json()))
    else:
        print(f"❌ Fail {pid}, status {response.status_code}")
    time.sleep(random.uniform(1, 3))  # tránh bị chặn

df_product = pd.DataFrame(result)
df_product.to_csv("crawl_data/details_product_ncds.csv", index=False)
