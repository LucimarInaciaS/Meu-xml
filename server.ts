import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import forge from "node-forge";
import axios from "axios";
import { parseStringPromise } from "xml2js";
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

const upload = multer({ storage: multer.memoryStorage() });

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Stripe Webhook (needs raw body)
  app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    // Webhook logic here
    res.json({ received: true });
  });

  app.use(express.json());

  // API: Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post('/api/create-checkout-session', async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe não configurado' });
    }

    const { userId, email } = req.body;

    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: process.env.VITE_PRO_PLAN_PRICE_ID,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${req.headers.origin}/?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.headers.origin}/`,
        customer_email: email,
        client_reference_id: userId,
      });

      res.json({ id: session.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API: Mock SEFAZ Fetch (Real implementation would require complex SOAP/XML signing)
  app.post("/api/fetch-nfe", upload.single("certificate"), async (req, res) => {
    try {
      const { password, cnpj } = req.body;
      const certFile = req.file;

      if (!certFile || !password || !cnpj) {
        return res.status(400).json({ error: "Certificado, senha e CNPJ são obrigatórios." });
      }

      // Em uma implementação real, usaríamos o node-forge para extrair a chave privada e o certificado
      // para assinar a requisição SOAP para o webservice da SEFAZ (NFeDistribuicaoDFe).
      
      // Simulação de processamento do certificado
      try {
        const p12Der = certFile.buffer.toString('binary');
        const p12Asn1 = forge.asn1.fromDer(p12Der);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
        // Se chegou aqui, a senha está correta
      } catch (e) {
        return res.status(401).json({ error: "Senha do certificado inválida ou arquivo corrompido." });
      }

      // Simulando retorno da SEFAZ
      const mockInvoices = [
        {
          id: "1",
          chNFe: "35231000000000000000550010000000011000000001",
          nome: "Fornecedor de Exemplo LTDA",
          valor: 1250.50,
          data: new Date().toISOString(),
          status: "Autorizada"
        },
        {
          id: "2",
          chNFe: "35231000000000000000550010000000021000000002",
          nome: "Distribuidora de Papéis S.A.",
          valor: 450.00,
          data: new Date(Date.now() - 86400000).toISOString(),
          status: "Autorizada"
        }
      ];

      res.json({ success: true, invoices: mockInvoices });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao processar consulta na SEFAZ." });
    }
  });

  // API: SPED Extraction
  app.post("/api/extract-sped", upload.single("spedFile"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: "Arquivo SPED é obrigatório." });
      }

      const content = file.buffer.toString('utf-8');
      const lines = content.split('\n');
      const keys: string[] = [];

      for (const line of lines) {
        const fields = line.split('|');
        // Record C100 (NF-e)
        // Field 9 (index 8) is usually the access key (44 digits)
        if (fields[1] === 'C100') {
          const key = fields[9];
          if (key && key.length === 44 && /^\d+$/.test(key)) {
            keys.push(key);
          }
        }
      }

      // Remove duplicates
      const uniqueKeys = [...new Set(keys)];

      res.json({ success: true, keys: uniqueKeys });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Erro ao processar arquivo SPED." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
