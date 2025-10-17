import requests
import time
import random
import pandas as pd

# cookies = {
#     "__trackity": "ea577314-31f6-6870-4121-d8afe1a6b2ad",
#     "_ga": "GA1.1.2059958594.1757945512",
#     "_gcl_au": "1.1.1846611957.1757945515",
#     "_tt_enable_cookie": "1",
#     "_ttp": "01K56VFKRDH4D7M75R3FRH8DJ6_.tt.1",
#     "__RC": "53",
#     "__R": "3",
#     "_fbp": "fb.1.1757945516215.311832589502984065",
#     "__utm": "source%3Dgoogle%7Cmedium%3Dcpc%7Ccampaign%3DSEA_NBR...",
#     "__iid": "749",
#     "__su": "0",
#     "_hjSessionUser_522327": "eyJpZCI6IjIyMzY4YTJlLTRjNzUtNTNiMi1hZWI0LW...",
#     "__tb": "0",
#     "__IP": "1952742374",
#     "TOKENS": '{"access_token":"9XAmRzuKoN6lQY2bHxSOckVewG0jpBPW"}',
#     "_gcl_aw": "GCL.1758102292.Cj0KCQjwuKnGBhD5ARIsAD19Rsb...",
#     "_gcl_gs": "2.1.k1$i1758102290$u165506106",
#     "delivery_zone": "Vk4wMzkwMDYwMDE=",
#     "tiki_client_id": "2059958594.1757945512",
#     "_hjSession_522327": "eyJpZCI6IjEyYWI1Yjc4LTEzZTktNDJkMy05NzJiLWM0ZDZhYTI1NTQ3OSIsIm...",
#     "__uif": "__uid%3A7920533691934457942%7C__ui%3A1%252C5%7C__create%3A1750682053",
#     "ttcsid": "1758355725804::zj-msBMmfCh2u7qGa4ca.14.1758356633325.0",
#     "_ga_S9GLR1RQFJ": "GS2.1.s1758355721$o18$g1$t1758356633$j53$l0$h0",
#     "amp_99d374": "DwHM8IfG5gfCu40Go53m_N...1j5j2m2m6.1j5j3hul2.ej.hm.109",
#     "ttcsid_D031T03C77UFNM54TPR0": "1758355725803::vZeXli77JiJKLPmVwtGr.14.1758356635213.0"
# }

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
    'Referer': 'https://tiki.vn/thoi-trang-nam/c915',
    'x-guest-token': '9XAmRzuKoN6lQY2bHxSOckVewG0jpBPW',
    'Connection': 'keep-alive',
    'TE': 'Trailers',
}

params = {
    'limit': '40',
    'include': 'advertisement',
    'aggregations': '2',
    'version': 'home-persionalized',
    'trackity_id': 'ea577314-31f6-6870-4121-d8afe1a6b2ad',
    'category': '917',
    'page': '1',
    'urlKey': 'ao-thun-nam'
}

product_id = []
for i in range(1, 31):
    params['page'] = i
    response = requests.get('https://tiki.vn/api/personalish/v1/blocks/listings', headers=headers, params=params)#, cookies=cookies)
    if response.status_code == 200:
        print('request success!!!')
        for record in response.json().get('data'):
            product_id.append({'id': record.get('id')})
    time.sleep(random.randrange(3, 10))

df = pd.DataFrame(product_id)
df.to_csv('crawl_data/product_id_ncds.csv', index=False)