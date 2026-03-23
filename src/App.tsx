import React, { useState, useRef, useEffect } from 'react';
import { 
  FileText, 
  Upload, 
  Search, 
  Download, 
  ShieldCheck, 
  AlertCircle, 
  Loader2,
  FileCode,
  History,
  LogIn,
  LogOut,
  User as UserIcon,
  Plus,
  FileJson,
  FileSearch,
  CheckCircle2,
  Copy,
  Printer,
  Info,
  ExternalLink,
  RefreshCw,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { supabase } from './supabase';
import AdBanner from './components/AdBanner';

interface Invoice {
  id: string;
  chNFe: string;
  nome: string;
  valor: number;
  data: string;
  status: string;
  user_id: string;
  created_at: string;
}

export default function App() {
  const [user, setUser] = useState<any | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [cnpj, setCnpj] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [step, setStep] = useState<'setup' | 'dashboard' | 'sped' | 'billing'>('setup');
  const [isPro, setIsPro] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  
  // SPED State
  const [spedFile, setSpedFile] = useState<File | null>(null);
  const [extractedKeys, setExtractedKeys] = useState<string[]>([]);
  const [spedLoading, setSpedLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const spedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) {
      setInvoices([]);
      setIsPro(false);
      return;
    }

    // Check subscription status
    const checkSub = async () => {
      if (!supabase) return;
      const { data, error } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', user.id)
        .single();
      
      if (data && data.status === 'active') {
        setIsPro(true);
      }
    };
    checkSub();

    const fetchInvoices = async () => {
      if (demoMode) {
        const localInvoices = localStorage.getItem('demo_invoices');
        if (localInvoices) {
          setInvoices(JSON.parse(localInvoices));
        }
        return;
      }
      if (!supabase) return;
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('data', { ascending: false });

      if (data) {
        setInvoices(data as Invoice[]);
      }
    };

    fetchInvoices();

    if (demoMode) return;

    // Realtime subscription
    const channel = supabase
      .channel('invoices_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'invoices',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        fetchInvoices();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Test connection to Supabase
  useEffect(() => {
    if (authReady && supabase) {
      const testConnection = async () => {
        try {
          const { error } = await supabase.from('invoices').select('count', { count: 'exact', head: true }).limit(1);
          if (error) {
            if (error.code === 'PGRST116' || error.message.includes('not found')) {
              setConnectionError("A tabela 'invoices' não foi encontrada. Por favor, execute o script SQL de migration no painel do Supabase.");
            } else {
              setConnectionError(`Erro de conexão com Supabase: ${error.message}`);
            }
            throw error;
          }
          setConnectionError(null);
        } catch (error: any) {
          console.error("Supabase connection error:", error);
        }
      };
      testConnection();
    }
  }, [authReady]);

  const handleLogin = async () => {
    if (!supabase) {
      setError("Supabase não configurado. Por favor, adicione as chaves no menu Secrets.");
      return;
    }
    console.log("Iniciando login com Google...");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error("Erro no login:", err);
      setError("Erro ao fazer login: " + err.message);
    }
  };

  const handleLogout = () => {
    if (demoMode) {
      setDemoMode(false);
      setUser(null);
      setStep('setup');
      return;
    }
    supabase?.auth.signOut();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleSpedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSpedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('Você precisa estar logado para buscar notas.');
      return;
    }
    if (!file || !cnpj) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('certificate', file);
    formData.append('cnpj', cnpj);

    try {
      const response = await fetch('/api/fetch-nfe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao buscar notas.');
      }

      // Save fetched invoices to Supabase or LocalStorage
      if (demoMode) {
        const updatedInvoices = [...invoices];
        for (const inv of data.invoices) {
          const existing = updatedInvoices.find(i => i.chNFe === inv.chNFe);
          if (!existing) {
            updatedInvoices.push({
              ...inv,
              id: Math.random().toString(36).substr(2, 9),
              user_id: user.id,
              created_at: new Date().toISOString()
            });
          }
        }
        setInvoices(updatedInvoices);
        localStorage.setItem('demo_invoices', JSON.stringify(updatedInvoices));
      } else if (supabase) {
        for (const inv of data.invoices) {
          const existing = invoices.find(i => i.chNFe === inv.chNFe);
          if (!existing) {
            await supabase.from('invoices').insert({
              ...inv,
              user_id: user.id
            });
          }
        }
      }

      setStep('dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExtractSped = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPro) {
      setStep('billing');
      return;
    }
    if (!spedFile) return;

    setSpedLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('spedFile', spedFile);

    try {
      const response = await fetch('/api/extract-sped', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar SPED.');
      }

      setExtractedKeys(data.keys);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSpedLoading(false);
    }
  };

  const generatePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.setTextColor(234, 88, 12); // Orange-600
    doc.text('DANFE - Documento Auxiliar da NF-e', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Gerado via Meu XML', 105, 26, { align: 'center' });

    // Invoice Info
    doc.setDrawColor(200);
    doc.line(20, 35, 190, 35);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text('DADOS DA NOTA FISCAL', 20, 45);
    
    doc.setFontSize(10);
    doc.text(`Emitente: ${invoice.nome}`, 20, 55);
    doc.text(`Chave de Acesso: ${invoice.chNFe}`, 20, 62);
    doc.text(`Data de Emissão: ${formatDate(invoice.data)}`, 20, 69);
    doc.text(`Status: ${invoice.status}`, 20, 76);
    doc.text(`Valor Total: ${formatCurrency(invoice.valor)}`, 20, 83);

    // Table Placeholder
    (doc as any).autoTable({
      startY: 95,
      head: [['Cód.', 'Descrição', 'Qtd', 'Un', 'Vl. Unit', 'Vl. Total']],
      body: [
        ['001', 'Produto Simulado 01', '1', 'UN', formatCurrency(invoice.valor), formatCurrency(invoice.valor)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [234, 88, 12] } // Orange-600
    });

    doc.save(`DANFE_${invoice.chNFe}.pdf`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast here
  };

  const handleCheckout = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email }),
      });
      const { url } = await response.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('Erro ao criar sessão de pagamento.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4">
        <Loader2 className="w-8 h-8 animate-spin text-orange-600 mb-6" />
        <p className="text-slate-500 text-sm mb-4">Carregando aplicativo...</p>
        <button 
          onClick={() => {
            setDemoMode(true);
            setUser({ id: 'demo-user', email: 'demo@example.com', user_metadata: { full_name: 'Usuário Demo' } });
            setAuthReady(true);
          }}
          className="text-orange-600 hover:text-orange-700 font-semibold text-sm underline underline-offset-4"
        >
          Demorando muito? Entrar em Modo Demo
        </button>
      </div>
    );
  }

  if (!supabase && !demoMode) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-orange-100">
          <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-orange-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Configuração Necessária</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            O Supabase ainda não foi configurado. Por favor, adicione as chaves 
            <code className="bg-slate-100 px-2 py-1 rounded mx-1 text-sm font-mono">VITE_SUPABASE_URL</code> 
            e 
            <code className="bg-slate-100 px-2 py-1 rounded mx-1 text-sm font-mono">VITE_SUPABASE_ANON_KEY</code> 
            no menu <span className="font-semibold">Secrets</span> do AI Studio.
          </p>
          <div className="bg-orange-50 p-4 rounded-xl text-left mb-8">
            <h3 className="text-sm font-semibold text-orange-800 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Como configurar:
            </h3>
            <ol className="text-xs text-orange-700 space-y-2 list-decimal ml-4">
              <li>Crie um projeto no Supabase</li>
              <li>Vá em Project Settings &gt; API</li>
              <li>Copie a URL e a anon key</li>
              <li>Cole no menu Secrets do AI Studio</li>
            </ol>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Já configurei, recarregar
            </button>
            <button 
              onClick={() => {
                setDemoMode(true);
                setUser({ id: 'demo-user', email: 'demo@example.com', user_metadata: { full_name: 'Usuário Demo' } });
                setAuthReady(true);
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Usar Modo de Demonstração (Local)
            </button>
          </div>
          <p className="mt-6 text-[10px] text-slate-400">
            Dica: No menu Secrets, use exatamente os nomes <code className="text-slate-500">VITE_SUPABASE_URL</code> e <code className="text-slate-500">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Erro de Conexão</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            {connectionError}
          </p>
          <div className="bg-red-50 p-4 rounded-xl text-left mb-8">
            <h3 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Como resolver:
            </h3>
            <ol className="text-xs text-red-700 space-y-2 list-decimal ml-4">
              <li>Acesse o painel do Supabase</li>
              <li>Vá em <strong>SQL Editor</strong></li>
              <li>Copie o conteúdo do arquivo de migration em <code className="bg-white px-1 rounded">/supabase/migrations/...</code></li>
              <li>Execute o script para criar as tabelas</li>
            </ol>
          </div>
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar Aplicativo
            </button>
            <button 
              onClick={() => {
                setDemoMode(true);
                setUser({ id: 'demo-user', email: 'demo@example.com', user_metadata: { full_name: 'Usuário Demo' } });
                setAuthReady(true);
                setConnectionError(null);
              }}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              Usar Modo de Demonstração (Local)
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-2 rounded-lg">
              <FileCode className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Meu XML</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="hidden md:flex flex-col items-end">
                  <span className="text-sm font-bold text-slate-900">{user.user_metadata?.full_name || user.email}</span>
                  <span className="text-xs text-slate-500">{user.email}</span>
                </div>
                {user.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Profile" className="w-9 h-9 rounded-full border border-slate-200" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                    <UserIcon className="w-5 h-5" />
                  </div>
                )}
                <button 
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={handleLogin}
                className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 hover:bg-emerald-700 transition-all shadow-sm"
              >
                <LogIn className="w-4 h-4" />
                Entrar com Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6">
        {!user ? (
          <div className="max-w-2xl mx-auto text-center py-20">
            <div className="bg-orange-50 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <ShieldCheck className="text-orange-600 w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Gerencie seus XMLs com segurança</h2>
            <p className="text-slate-500 text-lg mb-8">
              Faça login para buscar suas notas fiscais de compra diretamente da SEFAZ e mantê-las organizadas em um só lugar.
            </p>
            <button 
              onClick={handleLogin}
              className="bg-white border-2 border-slate-200 px-8 py-4 rounded-2xl font-bold text-slate-700 hover:border-orange-600 hover:text-orange-600 transition-all flex items-center gap-3 mx-auto shadow-sm"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              Começar agora com Google
            </button>

            {error && (
              <div className="mt-8 bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3 max-w-md mx-auto">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {demoMode && (
              <div className="bg-orange-600 text-white text-center py-2 px-4 rounded-xl font-bold text-sm shadow-lg animate-pulse">
                🚀 MODO DE DEMONSTRAÇÃO ATIVO - Seus dados estão sendo salvos apenas localmente neste navegador.
              </div>
            )}

            {/* Tabs */}
            <div className="flex border-b border-slate-200">
              <button 
                onClick={() => setStep('dashboard')}
                className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${step === 'dashboard' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Minhas Notas
              </button>
              <button 
                onClick={() => setStep('setup')}
                className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${step === 'setup' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Buscar na SEFAZ
              </button>
              <button 
                onClick={() => setStep('sped')}
                className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${step === 'sped' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Extração SPED
              </button>
              <button 
                onClick={() => setStep('billing')}
                className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${step === 'billing' ? 'border-orange-600 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                {isPro ? 'Meu Plano' : 'Assinar Pro'}
              </button>
            </div>

            {!isPro && (
              <div className="my-6">
                <AdBanner type="horizontal" />
              </div>
            )}

            <AnimatePresence mode="wait">
              {step === 'setup' && (
                <motion.div
                  key="setup"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-xl mx-auto"
                >
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
                    <div className="mb-8 text-center">
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">Configuração de Acesso</h2>
                      <p className="text-slate-500">Conecte sua empresa à SEFAZ com segurança.</p>
                    </div>

                    {/* Informative Notices */}
                    <div className="grid gap-4 mb-8">
                      <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex items-start gap-4">
                        <div className="bg-white p-2 rounded-xl shadow-sm">
                          <ShieldCheck className="text-orange-600 w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-orange-900">Acesso Autenticado</p>
                          <p className="text-xs text-orange-700 leading-relaxed mt-1">
                            Para sua proteção e conformidade legal, o download de notas requer o **Certificado Digital A1** da empresa.
                          </p>
                        </div>
                      </div>

                      <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-4">
                        <div className="bg-white p-2 rounded-xl shadow-sm">
                          <Search className="text-emerald-600 w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-emerald-900">Agilidade na Coleta</p>
                          <p className="text-xs text-emerald-700 leading-relaxed mt-1">
                            Economize tempo! Você pode utilizar um **leitor de código de barras** para capturar as chaves de acesso instantaneamente.
                          </p>
                        </div>
                      </div>
                    </div>

                    <form onSubmit={handleFetch} className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">CNPJ da Empresa</label>
                        <div className="relative">
                          <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                          <input
                            type="text"
                            placeholder="00.000.000/0000-00"
                            value={cnpj}
                            onChange={(e) => setCnpj(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Certificado Digital (A1 .pfx)</label>
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                            file ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-400 hover:bg-slate-50'
                          }`}
                        >
                          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pfx,.p12" className="hidden" />
                          <div className="flex flex-col items-center gap-3">
                            <div className={`p-3 rounded-full ${file ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                              <Upload className="w-6 h-6" />
                            </div>
                            {file ? (
                              <p className="font-medium text-orange-900">{file.name}</p>
                            ) : (
                              <p className="font-medium text-slate-700">Clique para selecionar o certificado</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {error && (
                        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                          <p className="text-sm font-medium">{error}</p>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                        {loading ? 'Consultando...' : 'Buscar Notas Fiscais'}
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}

              {step === 'dashboard' && (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-6"
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold text-slate-900">Minhas Notas</h2>
                    <div className="bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600">
                      {invoices.length} Notas Salvas
                    </div>
                  </div>

                  <div className="grid gap-4">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all group">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="bg-slate-100 p-3 rounded-xl text-slate-500 group-hover:bg-orange-50 group-hover:text-orange-600 transition-colors">
                              <FileText className="w-6 h-6" />
                            </div>
                            <div>
                              <h3 className="font-bold text-slate-900 leading-tight">{invoice.nome}</h3>
                              <p className="text-xs font-mono text-slate-500 mt-1">{invoice.chNFe}</p>
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-sm font-medium text-slate-600">{formatDate(invoice.data)}</span>
                                <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold uppercase tracking-wider">
                                  {invoice.status}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-4 md:pt-0">
                            <div className="text-right mr-4">
                              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Valor Total</p>
                              <p className="text-xl font-black text-slate-900">{formatCurrency(invoice.valor)}</p>
                            </div>
                            <div className="flex gap-2">
                              <button 
                                onClick={() => generatePDF(invoice)}
                                className="bg-slate-100 text-slate-700 p-3 rounded-xl hover:bg-orange-600 hover:text-white transition-all"
                                title="Gerar PDF (DANFE)"
                              >
                                <Printer className="w-5 h-5" />
                              </button>
                              <button className="bg-slate-900 text-white p-3 rounded-xl hover:bg-orange-600 transition-all">
                                <Download className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {invoices.length === 0 && (
                    <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
                      <Search className="text-slate-400 w-12 h-12 mx-auto mb-4" />
                      <h3 className="text-lg font-bold text-slate-900">Nenhuma nota salva</h3>
                      <p className="text-slate-500">Suas notas aparecerão aqui após a primeira busca.</p>
                    </div>
                  )}
                </motion.div>
              )}

              {step === 'sped' && (
                <motion.div
                  key="sped"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-3xl mx-auto space-y-6"
                >
                  {!isPro && (
                    <div className="bg-orange-600 text-white p-6 rounded-2xl flex items-center justify-between shadow-lg shadow-orange-200">
                      <div className="flex items-center gap-4">
                        <div className="bg-white/20 p-2 rounded-xl">
                          <ShieldCheck className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="font-bold text-lg">Recurso Premium</p>
                          <p className="text-orange-100 text-sm">A extração de SPED está disponível apenas no plano Pro.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setStep('billing')}
                        className="bg-white text-orange-600 px-6 py-2 rounded-xl font-bold hover:bg-orange-50 transition-all"
                      >
                        Upgrade agora
                      </button>
                    </div>
                  )}

                  <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-8 ${!isPro ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    <div className="mb-8 text-center">
                      <h2 className="text-2xl font-bold text-slate-900 mb-2">Extração de Chaves SPED</h2>
                      <p className="text-slate-500">Envie seu arquivo SPED (EFD ICMS/IPI) para extrair as chaves de acesso das notas fiscais.</p>
                    </div>

                    <form onSubmit={handleExtractSped} className="space-y-6">
                      <div 
                        onClick={() => spedInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
                          spedFile ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-orange-400 hover:bg-slate-50'
                        }`}
                      >
                        <input type="file" ref={spedInputRef} onChange={handleSpedChange} accept=".txt" className="hidden" />
                        <div className="flex flex-col items-center gap-4">
                          <div className={`p-4 rounded-full ${spedFile ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                            <FileSearch className="w-8 h-8" />
                          </div>
                          {spedFile ? (
                            <div>
                              <p className="font-bold text-orange-900 text-lg">{spedFile.name}</p>
                              <p className="text-sm text-orange-600 mt-1">Clique para trocar o arquivo</p>
                            </div>
                          ) : (
                            <div>
                              <p className="font-bold text-slate-700 text-lg">Selecione o arquivo SPED (.txt)</p>
                              <p className="text-sm text-slate-500 mt-1">O sistema buscará registros C100 automaticamente</p>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={!spedFile || spedLoading}
                        className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                      >
                        {spedLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileJson className="w-5 h-5" />}
                        {spedLoading ? 'Processando SPED...' : 'Extrair Chaves de Acesso'}
                      </button>
                    </form>
                  </div>

                  {extractedKeys.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden"
                    >
                      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                          <h3 className="font-bold text-slate-900">{extractedKeys.length} Chaves Encontradas</h3>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(extractedKeys.join('\n'))}
                          className="text-orange-600 font-bold text-sm flex items-center gap-1 hover:text-orange-700"
                        >
                          <Copy className="w-4 h-4" />
                          Copiar Todas
                        </button>
                      </div>
                      <div className="max-h-96 overflow-y-auto p-4">
                        <div className="grid gap-2">
                          {extractedKeys.map((key, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-100 group">
                              <span className="font-mono text-sm text-slate-600">{key}</span>
                              <button 
                                onClick={() => copyToClipboard(key)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-orange-600"
                              >
                                <Copy className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
              {step === 'billing' && (
                <motion.div
                  key="billing"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="text-center mb-12">
                    <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Escolha o plano ideal para você</h2>
                    <p className="text-slate-500 text-lg">Automatize sua gestão fiscal e ganhe tempo.</p>
                  </div>

                  <div className="flex justify-center">
                    {/* Pro Plan */}
                    <div className="bg-white border-2 border-orange-600 rounded-3xl p-8 flex flex-col relative overflow-hidden shadow-xl shadow-orange-100 max-w-md w-full">
                      <div className="absolute top-0 right-0 bg-orange-600 text-white px-4 py-1 rounded-bl-xl text-xs font-bold uppercase tracking-widest">
                        Recomendado
                      </div>
                      <div className="mb-6">
                        <h3 className="text-xl font-bold text-slate-900">Plano Pro</h3>
                        <p className="text-slate-500 text-sm">Para contadores e empresas</p>
                      </div>
                      <div className="mb-8">
                        <span className="text-4xl font-black text-slate-900">R$ 49</span>
                        <span className="text-slate-400 font-bold">,90/mês</span>
                      </div>
                      <ul className="space-y-4 mb-8 flex-grow">
                        <li className="flex items-center gap-3 text-slate-600 text-sm">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                          Busca de Notas na SEFAZ
                        </li>
                        <li className="flex items-center gap-3 text-slate-600 text-sm">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                          Geração de DANFE (PDF)
                        </li>
                        <li className="flex items-center gap-3 text-slate-600 text-sm">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                          Extração Ilimitada de SPED
                        </li>
                        <li className="flex items-center gap-3 text-emerald-600 text-sm font-bold">
                          <CheckCircle2 className="w-5 h-5" />
                          Navegação sem anúncios
                        </li>
                        <li className="flex items-center gap-3 text-slate-600 text-sm">
                          <CheckCircle2 className="text-emerald-500 w-5 h-5" />
                          Exportação em Massa
                        </li>
                      </ul>
                      <button 
                        onClick={handleCheckout}
                        disabled={isPro || loading}
                        className={`w-full py-4 rounded-2xl font-bold transition-all shadow-lg ${isPro ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200'}`}
                      >
                        {isPro ? 'Você é Pro!' : loading ? 'Processando...' : 'Assinar Plano Pro'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      <footer className="max-w-6xl mx-auto p-6 mt-12 border-t border-slate-200 text-center">
        <p className="text-sm text-slate-400">
          © 2026 Meu XML • Gestão inteligente de notas fiscais
        </p>
      </footer>
    </div>
  );
}
