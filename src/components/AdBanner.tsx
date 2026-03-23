import React from 'react';
import { ExternalLink, Info } from 'lucide-react';

interface AdBannerProps {
  type?: 'horizontal' | 'vertical' | 'square';
  className?: string;
}

export default function AdBanner({ type = 'horizontal', className = '' }: AdBannerProps) {
  // In a real production app, you would insert your Google AdSense code here
  // <ins className="adsbygoogle" ... />
  
  const getDimensions = () => {
    switch (type) {
      case 'vertical': return 'w-full h-[600px]';
      case 'square': return 'w-full aspect-square';
      default: return 'w-full h-32';
    }
  };

  return (
    <div className={`bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex flex-col items-center justify-center relative group ${getDimensions()} ${className}`}>
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Anúncio</span>
        <Info className="w-3 h-3 text-slate-400" />
      </div>
      
      <div className="text-center p-6">
        <div className="bg-white p-3 rounded-2xl shadow-sm inline-block mb-3">
          <ExternalLink className="w-6 h-6 text-orange-600" />
        </div>
        <p className="text-sm font-bold text-slate-900">Seu Anúncio Aqui</p>
        <p className="text-xs text-slate-500 mt-1">Alcance milhares de contadores e empresas.</p>
        <button className="mt-4 text-xs font-bold text-orange-600 hover:underline">
          Anuncie conosco
        </button>
      </div>
      
      {/* Decorative background elements to simulate an ad */}
      <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-orange-100 rounded-full blur-2xl opacity-50" />
      <div className="absolute -top-4 -left-4 w-24 h-24 bg-emerald-100 rounded-full blur-2xl opacity-50" />
    </div>
  );
}
