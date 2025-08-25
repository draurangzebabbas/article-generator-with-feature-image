//r1 as main and ui inhanced article preview
import React, { useState } from 'react';
import { 
  Eye, 
  Download, 
  Copy, 
  CheckCircle, 
  ExternalLink,
  Image as ImageIcon,
  FileText,
  Code,
  BookOpen,
  Calendar,
  Clock,
  Zap,
  AlertCircle
} from 'lucide-react';

interface ArticlePreviewProps {
  article: {
    id: string;
    request_id: string;
    title: string;
    excerpt: string;
    complete_article: string;
    validated_tool_result: string;
    guide_generator_result: string;
    section_1_generator_result?: string;
    section_2_generator_result?: string;
    faq_generator_result?: string;
    feature_image_urls: string[];
    processing_time: number;
    success_rate: string;
    total_modules_executed?: number;
    created_at: string;
    main_keyword?: string;
  };
  onClose: () => void;
}

export const ArticlePreview: React.FC<ArticlePreviewProps> = ({ article, onClose }) => {
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'preview' | 'html' | 'tool' | 'guide'>('preview');

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadArticle = () => {
    const element = document.createElement('a');
    const file = new Blob([article.complete_article], { type: 'text/html' });
    element.href = URL.createObjectURL(file);
    element.download = `${article.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.html`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatProcessingTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">{article.title}</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={downloadArticle}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
            <button
              onClick={() => copyToClipboard(article.complete_article, 'article')}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {copied === 'article' ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>{copied === 'article' ? 'Copied!' : 'Copy Article'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <span className="sr-only">Close</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Article Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Keyword:</span>
                  <p className="font-medium">{article.main_keyword || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-gray-500">Processing Time:</span>
                  <p className="font-medium">{formatProcessingTime(article.processing_time)}</p>
                </div>
                <div>
                  <span className="text-gray-500">Success Rate:</span>
                  <p className="font-medium">{article.success_rate}</p>
                </div>
                <div>
                  <span className="text-gray-500">Created:</span>
                  <p className="font-medium">{formatDate(article.created_at)}</p>
                </div>
              </div>
            </div>

            {/* Article Title and Excerpt */}
            <div className="text-center">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
              {article.excerpt && (
                <p className="text-xl text-gray-600 max-w-3xl mx-auto">{article.excerpt}</p>
              )}
            </div>

            {/* Featured Images */}
            {article.feature_image_urls && article.feature_image_urls.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <ImageIcon className="w-5 h-5 mr-2 text-blue-600" />
                  Featured Images
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {article.feature_image_urls.map((url, index) => (
                    <div key={index} className="relative group">
                      <img
                        src={url}
                        alt={`Generated image ${index + 1}`}
                        className="w-full h-48 object-cover rounded-lg shadow-md group-hover:shadow-lg transition-shadow duration-200"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 rounded-lg flex items-center justify-center">
                        <button
                          onClick={() => window.open(url, '_blank')}
                          className="opacity-0 group-hover:opacity-100 bg-white text-gray-900 px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:bg-gray-100"
                        >
                          View Full Size
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tool */}
            {article.validated_tool_result && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Code className="w-5 h-5 mr-2 text-green-600" />
                  Interactive Tool
                </h3>
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <div dangerouslySetInnerHTML={{ __html: article.validated_tool_result }} />
                </div>
              </div>
            )}

            {/* Guide */}
            {article.guide_generator_result && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <BookOpen className="w-5 h-5 mr-2 text-blue-600" />
                  How to Use
                </h3>
                <div className="prose prose-lg max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: article.guide_generator_result }} />
                </div>
              </div>
            )}

            {/* Section 1 */}
            {article.section_1_generator_result && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 1</h3>
                <div className="prose prose-lg max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: article.section_1_generator_result }} />
                </div>
              </div>
            )}

            {/* Section 2 */}
            {article.section_2_generator_result && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 2</h3>
                <div className="prose prose-lg max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: article.section_2_generator_result }} />
                </div>
              </div>
            )}

            {/* FAQ */}
            {article.faq_generator_result && (
              <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <AlertCircle className="w-5 h-5 mr-2 text-yellow-600" />
                  Frequently Asked Questions
                </h3>
                <div className="prose prose-lg max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: article.faq_generator_result }} />
                </div>
              </div>
            )}

            {/* Complete Article HTML */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-blue-600" />
                  Complete Article HTML
                </h3>
                <button
                  onClick={() => copyToClipboard(article.complete_article, 'article')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors duration-200 flex items-center text-sm"
                >
                  {copied === 'article' ? (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  ) : (
                    <Copy className="w-4 h-4 mr-2" />
                  )}
                  Copy Article
                </button>
              </div>
              <div className="prose prose-lg max-w-none">
                <div dangerouslySetInnerHTML={{ __html: article.complete_article }} />
              </div>
            </div>

            {/* Validated Tool */}
            {article.validated_tool_result && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Code className="w-5 h-5 mr-2 text-green-600" />
                    Interactive Tool
                  </h3>
                  <button
                    onClick={() => copyToClipboard(article.validated_tool_result, 'tool')}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg transition-colors duration-200 flex items-center text-sm"
                  >
                    {copied === 'tool' ? (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    Copy Tool
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <div dangerouslySetInnerHTML={{ __html: article.validated_tool_result }} />
                </div>
              </div>
            )}

            {/* Guide Generator Result */}
            {article.guide_generator_result && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <BookOpen className="w-5 h-5 mr-2 text-purple-600" />
                    Usage Guide
                  </h3>
                  <button
                    onClick={() => copyToClipboard(article.guide_generator_result, 'guide')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition-colors duration-200 flex items-center text-sm"
                  >
                    {copied === 'guide' ? (
                      <CheckCircle className="w-4 h-4 mr-2" />
                    ) : (
                      <Copy className="w-4 h-4 mr-2" />
                    )}
                    Copy Guide
                  </button>
                </div>
                <div className="prose prose-lg max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: article.guide_generator_result }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
