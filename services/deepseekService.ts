
import { ProductInput, ProductResult } from "../types";

/**
 * 延迟函数
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const processProductsWithDeepSeek = async (
  products: ProductInput[],
  apiKey: string
): Promise<ProductResult[]> => {
  const prompt = `
    你是一位专业的跨境电商运营专家，精通俄语和 Ozon 平台的 SEO 优化。
    
    任务：
    1. 接收产品列表（SKU 和 中文名）。
    2. 为每个产品生成一个符合 Ozon 命名规则的俄文名称。
       规则：[品类核心词] + [品牌/系列(若无则省略)] + [核心属性/规格] + [主要功能/特点]。
       要求：
       - 禁止使用“最便宜”、“最好”、“促销”等词汇。
       - **特别注意：生成的俄文名称中绝对不要包含 SKU 编号信息。**
       - 确保名称符合俄罗斯消费者的搜索习惯（SEO）。
    3. 为每个产品写一段俄文产品简介，结构如下：
       - 结构化卖点（列出核心优势）
       - SEO 埋词（融入热搜词）
       - 信任感建立（售后、品质保障等）
    4. 为每款产品生成 10-20 个俄文标签 (Tags)：
       - 格式：#标签1 #标签2 #标签3
       - 若标签内有空格，用下划线 "_" 代替。
       - 每个标签长度不超过 30 个字符。
    5. 将生成的俄文名称翻译回中文。

    输出必须是一个包含 "products" 键的 JSON 对象，示例如下：
    {
      "products": [
        {
          "sku": "...",
          "russianName": "...",
          "russianDescription": "...",
          "russianTags": "#tag1 #tag2",
          "backTranslation": "..."
        }
      ]
    }

    待处理产品数据：
    ${products.map(p => `SKU: ${p.sku}, 中文名: ${p.chineseName}`).join('\n')}
  `;

  const makeRequest = async (attempt: number): Promise<any> => {
    try {
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You are a professional e-commerce specialist. Always respond with a valid JSON object containing a 'products' array." },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          stream: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 429 && attempt < 3) {
          const waitTime = Math.pow(2, attempt + 1) * 1000;
          await delay(waitTime);
          return makeRequest(attempt + 1);
        }
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      let content = data.choices[0].message.content.trim();
      
      // Attempt to find JSON array if wrapped in text
      if (content.includes("[") && content.includes("]")) {
        content = content.substring(content.indexOf("["), content.lastIndexOf("]") + 1);
      }
      
      return JSON.parse(content);
    } catch (error: any) {
      if (attempt < 2) {
        await delay(2000);
        return makeRequest(attempt + 1);
      }
      throw error;
    }
  };

  try {
    const rawResults = await makeRequest(0);
    const results = Array.isArray(rawResults) ? rawResults : (rawResults.products || []);

    return results.map((res: any) => {
      const original = products.find(p => p.sku === res.sku);
      return {
        sku: res.sku,
        chineseName: original?.chineseName || "未知",
        russianName: res.russianName || "生成失败",
        russianDescription: res.russianDescription || "生成失败",
        russianTags: res.russianTags || "",
        backTranslation: res.backTranslation || "翻译失败"
      };
    });
  } catch (error: any) {
    console.error("DeepSeek API Error:", error);
    throw new Error(`DeepSeek 处理失败: ${error.message}`);
  }
};
