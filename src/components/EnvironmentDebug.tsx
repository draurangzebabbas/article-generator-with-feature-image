import React from 'react';

export const EnvironmentDebug: React.FC = () => {
  const envVars = {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY ? '***SET***' : 'NOT SET',
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    NODE_ENV: import.meta.env.NODE_ENV,
    MODE: import.meta.env.MODE,
  };

  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white p-4 rounded-lg text-xs max-w-xs z-50">
      <h3 className="font-bold mb-2">🔧 Environment Debug</h3>
      <div className="space-y-1">
        {Object.entries(envVars).map(([key, value]) => (
          <div key={key}>
            <span className="text-gray-300">{key}:</span>
            <span className="ml-2 text-green-400">{value || 'NOT SET'}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs text-gray-400">
        Current URL: {window.location.href}
      </div>
    </div>
  );
};
