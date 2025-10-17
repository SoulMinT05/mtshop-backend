import re
import requests
import pandas as pd
import time
import random
from tqdm import tqdm
import bcrypt

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Referer': 'https://tiki.vn/set-2-ao-thun-ba-lo-nam-sat-nach-soi-cotton-mem-min-tham-hut-mo-hoi-thoang-mat-co-gian-4-chieu-mrm-manlywear-mm-p68202834.html?spid=68202880',
    'x-guest-token': '9XAmRzuKoN6lQY2bHxSOckVewG0jpBPW',  # token này bạn lấy động được càng tốt
}

params = {
    'product_id': '',
    'sort': 'score|desc,id|desc,stars|all',
    'page': '1',
    'limit': '5',
    'include': 'comments'
}

def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def generate_email(name, user_id):
    if not name:
        name = "user"
    # Loại bỏ dấu, ký tự đặc biệt, viết thường
    base = re.sub(r'[^a-z0-9]', '', name.lower().replace(" ", ""))
    return f"{base}_{user_id}@gmail.com"

def comment_parser(json):
    d = dict()
    d['reviewId'] = json.get('id')
    d['productId'] = json.get('product_id')

    d['title'] = json.get('title')
    d['comment'] = json.get('content')
    d['rating'] = json.get('rating')
    d['createdAt'] = json.get('created_at') # Time review đc tạo

    created_by = json.get('created_by') or {}
    d['userId']  = json.get('customer_id')
    d['name'] = created_by.get('name')  
    d['purchased_at'] = created_by.get('purchased_at') # Time order đc tạo

    return d

# Đọc danh sách product_id từ file CSV
df_id = pd.read_csv('crawl_data/product_id_ncds.csv')
p_ids = df_id.id.to_list()[:2]

result = []
for pid in tqdm(p_ids, total=len(p_ids)):
    params['product_id'] = pid
    print(f'Crawl comment for product {pid}')
    for i in range(1, 3):  # page 1 -> 2
        params['page'] = str(i)
        response = requests.get('https://tiki.vn/api/v2/reviews', headers=headers, params=params)
        if response.status_code == 200:
            print(f'Crawl comment page {i} success!!!')
            for comment in response.json().get('data', []):
                result.append(comment_parser(comment))
        else:
            print(f'Failed page {i}, status: {response.status_code}')
        time.sleep(random.uniform(1, 2))  # tránh bị chặn

df_comment = pd.DataFrame(result)
# Reviews
df_comment.to_csv('crawl_data/reviews_ncds.csv', index=False, encoding='utf-8-sig')
# Users
df_user = df_comment[['userId', 'name', 'purchased_at']].drop_duplicates(subset=['userId'])
# Tạo email
df_user['email'] = df_user.apply(lambda row: generate_email(row['name'], row['userId']), axis=1)
df_user['password'] = df_user.apply(lambda row: hash_password("Xinchaorubystore_123"), axis=1)
df_user.to_csv('crawl_data/users_ncds.csv', index=False, encoding='utf-8-sig')