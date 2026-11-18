"""Provider selection for the mainland deployment."""
import os
from urllib.parse import urlparse

AI_HOSTS={'ark.cn-beijing.volces.com','ark.cn-shanghai.volces.com','api-ai.vivo.com.cn','api.deepseek.com','dashscope.aliyuncs.com','dashscope.cn-beijing.aliyuncs.com'}

def allowed_ai_url(value):
    if os.getenv('DOMESTIC_ONLY','1')=='0':return True
    parsed=urlparse(value)
    return parsed.scheme=='https' and parsed.hostname in AI_HOSTS
