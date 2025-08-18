import React, { useState } from 'react';
import { 
  FileText, 
  Play, 
  Settings,
  Download,
  Copy,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface ModelConfig {
  metaGenerator: string;
  toolGenerator: string;
  toolValidator: string;
  guideGenerator: string;
  section1Generator: string;
  section1Summary: string;
  section2Generator: string;
  faqGenerator: string;
}

interface GenerationResult {
  request_id: string;
  main_keyword: string;
  processing_time: number;
  api_keys_used: number;
  title: string;
  excerpt: string;
  section_1_headings: string[];
  section_2_headings: string[];
  faq_questions: string[];
  tool_generator_result: string;
  validated_tool_result: string;
  guide_generator_result: string;
  section_1_generator_result: string;
  section_1_summary_result: string;
  section_2_generator_result: string;
  faq_generator_result: string;
  complete_article: string;
  status: string;
  total_modules_executed: number;
  success_rate: string;
  feature_image_prompt?: string;
  feature_image_url?: string;
  image_width?: number;
  image_height?: number;
}

export const ArticleGenerator: React.FC = () => {
  const [formData, setFormData] = useState({
    mainKeyword: '',
    top10Articles: '',
    relatedKeywords: '',
    guidelines: '',
    generateImage: false,
    imagePrompt: '',
    imageWidth: 1200,
    imageHeight: 630
  });
  
  const [models, setModels] = useState<ModelConfig>({
    metaGenerator: 'deepseek/deepseek-chat-v3-0324:free',
    toolGenerator: 'qwen/qwen-2.5-coder-32b-instruct:free',
    toolValidator: 'qwen/qwen-2.5-coder-32b-instruct:free',
    guideGenerator: 'deepseek/deepseek-chat-v3-0324:free',
    section1Generator: 'deepseek/deepseek-chat-v3-0324:free',
    section1Summary: 'deepseek/deepseek-chat-v3-0324:free',
    section2Generator: 'deepseek/deepseek-chat-v3-0324:free',
    faqGenerator: 'deepseek/deepseek-chat-v3-0324:free'
  });
  
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { user } = useAuth();

  const availableModels = [
    'deepseek/deepseek-chat-v3-0324:free',
    'qwen/qwen-2.5-coder-32b-instruct:free',
    'anthropic/claude-3.5-sonnet:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'google/gemini-flash-1.5:free'
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError(null);
  };

  const handleModelChange = (field: keyof ModelConfig, value: string) => {
    setModels(prev => ({ ...prev, [field]: value }));
  };

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  };

  const handleGenerate = async () => {
    if (!formData.mainKeyword || !formData.top10Articles || !formData.relatedKeywords) {
      setError('Please fill in all required fields');
      return;
    }

    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/generate-article`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.webhook_token}`
        },
        body: JSON.stringify({
          ...formData,
          models
        })
      });

      const contentType = response.headers.get('content-type') || '';
      let data: any = null;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (!response.ok) {
          throw new Error(text || 'Server returned an unexpected error');
        }
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error('Server returned an invalid response');
        }
      }

      if (!response.ok) {
        const serverMessage = data?.message || data?.error || 'Failed to generate article';
        throw new Error(serverMessage);
      }

      setResult(data);
    } catch (err: any) {
      const friendly = err?.message?.includes('Failed to fetch')
        ? 'Network error: Unable to reach the server. Please check your connection and try again.'
        : err?.message || 'An error occurred during generation';
      setError(friendly);
    } finally {
      setGenerating(false);
    }
  };

  const downloadResult = (type: 'article' | 'tool' | 'guide') => {
    if (!result) return;

    let content = '';
    let filename = '';

    switch (type) {
      case 'article':
        content = result.complete_article;
        filename = `${result.main_keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_article.html`;
        break;
      case 'tool':
        content = result.validated_tool_result;
        filename = `${result.main_keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_tool.html`;
        break;
      case 'guide':
        content = result.guide_generator_result;
        filename = `${result.main_keyword.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_guide.html`;
        break;
    }

    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Article Generator</h1>
          <p className="text-gray-600">Generate complete SEO-optimized articles with tools and guides</p>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center"
        >
          <Settings className="w-5 h-5 mr-2" />
          {showAdvanced ? 'Hide' : 'Advanced'} Settings
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-500 mr-3" />
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Input Form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Article Generation Input</h2>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Main Keyword *
            </label>
            <input
              type="text"
              required
              value={formData.mainKeyword}
              onChange={(e) => handleInputChange('mainKeyword', e.target.value)}
              placeholder="e.g., mortgage calculator"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Guidelines (Optional)
            </label>
            <input
              type="text"
              value={formData.guidelines}
              onChange={(e) => handleInputChange('guidelines', e.target.value)}
              placeholder="e.g., Create a simple calculator tool"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Top 10 Ranking Articles *
          </label>
          <textarea
            required
            value={formData.top10Articles}
            onChange={(e) => handleInputChange('top10Articles', e.target.value)}
            placeholder="Paste the top 10 ranking articles content here..."
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Related Keywords *
          </label>
          <textarea
            required
            value={formData.relatedKeywords}
            onChange={(e) => handleInputChange('relatedKeywords', e.target.value)}
            placeholder="Enter related keywords, one per line or comma-separated..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Image Generation */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-md font-semibold text-gray-900 mb-3">Feature Image Generation</h3>
          <div className="flex items-center mb-4">
            <input
              id="generateImage"
              type="checkbox"
              checked={formData.generateImage}
              onChange={(e) => handleInputChange('generateImage', e.target.checked as any)}
              className="mr-2"
            />
            <label htmlFor="generateImage" className="text-sm text-gray-800">Generate feature image</label>
          </div>
          {formData.generateImage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Image Prompt (optional)</label>
                <input
                  type="text"
                  value={formData.imagePrompt}
                  onChange={(e) => handleInputChange('imagePrompt', e.target.value)}
                  placeholder="Describe the hero image you want..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Width</label>
                  <input
                    type="number"
                    value={formData.imageWidth}
                    onChange={(e) => handleInputChange('imageWidth', e.target.value)}
                    placeholder="1200"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Height</label>
                  <input
                    type="number"
                    value={formData.imageHeight}
                    onChange={(e) => handleInputChange('imageHeight', e.target.value)}
                    placeholder="630"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        {showAdvanced && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="text-md font-semibold text-gray-900 mb-4">Model Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(models).map(([key, value]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </label>
                  <select
                    value={value}
                    onChange={(e) => handleModelChange(key as keyof ModelConfig, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {availableModels.map(model => (
                      <option key={model} value={model}>{model}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 disabled:cursor-not-allowed text-white py-3 px-4 rounded-lg font-medium transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md transform hover:scale-105 active:scale-95"
          >
            {generating ? (
              <>
                <Clock className="w-5 h-5 mr-2 animate-spin" />
                Generating Article...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Generate Article
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Generation Results</h2>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                  {result.success_rate}
                </span>
                <span className="text-sm text-gray-500">
                  {result.processing_time}ms
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-semibold text-blue-900 mb-2">Title</h3>
                <p className="text-blue-800 text-sm">{result.title}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-2">API Keys Used</h3>
                <p className="text-green-800 text-sm">{result.api_keys_used}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-semibold text-purple-900 mb-2">Modules Executed</h3>
                <p className="text-purple-800 text-sm">{result.total_modules_executed}</p>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => downloadResult('article')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Article
              </button>
              <button
                onClick={() => downloadResult('tool')}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Tool
              </button>
              <button
                onClick={() => downloadResult('guide')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors duration-200 flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Guide
              </button>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Article Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Complete Article</h3>
                <button
                  onClick={() => copyToClipboard(result.complete_article, 'article')}
                  className="text-blue-600 hover:text-blue-700 transition-colors duration-200"
                >
                  {copied === 'article' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                <div dangerouslySetInnerHTML={{ __html: result.complete_article }} />
              </div>
            </div>

            {/* Tool Code */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Generated Tool</h3>
                <button
                  onClick={() => copyToClipboard(result.validated_tool_result, 'tool')}
                  className="text-blue-600 hover:text-blue-700 transition-colors duration-200"
                >
                  {copied === 'tool' ? (
                    <CheckCircle className="w-5 h-5" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg max-h-96 overflow-y-auto text-sm">
                <pre className="whitespace-pre-wrap">{result.validated_tool_result}</pre>
              </div>
            </div>
          </div>

          {/* SEO Data */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Headings & Image</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Generated Headings</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Section 1:</span>
                    <ul className="mt-1 space-y-1">
                      {result.section_1_headings.map((heading, index) => (
                        <li key={index} className="text-sm text-gray-600">• {heading}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-700">Section 2:</span>
                    <ul className="mt-1 space-y-1">
                      {result.section_2_headings.map((heading, index) => (
                        <li key={index} className="text-sm text-gray-600">• {heading}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div>
                {result.feature_image_url ? (
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Feature Image</h4>
                    <img
                      src={result.feature_image_url}
                      alt="Feature"
                      className="rounded-lg border border-gray-200 w-full"
                    />
                    {result.feature_image_prompt && (
                      <p className="text-xs text-gray-600 mt-2">Prompt: {result.feature_image_prompt}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No feature image generated.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
