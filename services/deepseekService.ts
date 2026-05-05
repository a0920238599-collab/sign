
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
    2. 为每个产品生成一个极具转化力的、符合 Ozon 最新 SEO 规范的俄文名称。
       结构：[品类核心词] + [品牌/系列(若无则省略)] + [核心属性/规格] + [主要功能/特点]。
       精进要求：
       - **地道表述**：遵循俄语语法习惯，优先将核心名词放在首位或核心位置（例如使用 "для" 连接用途）。
       - **SEO 深度优化**：使用俄罗斯消费者在 Ozon/Wildberries 上真实的搜索高频词，而非生硬翻译。
       - **去冗余**：禁止包含 SKU 编码、禁止堆砌形容词。删除所有类似 "Лидер продаж" (热销) 或 "Супер" (超级) 的非功能性词汇。
       - **可读性**：词义衔接自然，规格（如颜色、尺寸、件数）需标注清晰，一眼即能明白产品本质。
    3. 为每个产品写一段地道的俄文产品简介（段落形式），要求如下：
       - 禁止以列表形式直接堆砌关键词，必须写出逻辑通顺、语言自然连贯的段落。
       - 产品简介需包含以下三个维度的内容，并有机且自然地融入文中：
         a. 核心卖点与场景：描述产品的实际益处和使用体验。
         b. SEO 优化：将行业关联词自然整合到叙述语句中，不要单独列出。
         c. 信任感建立：以自然的口吻提及品质保证或售后信心。
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
