const path = require('path');
const fs = require('fs');
// Carrega o .env da pasta backend, não importa de onde o servidor foi iniciado
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/* =====================================================
   CONFIGURAÇÃO
===================================================== */
const { JWT_SECRET } = process.env;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('ERRO: defina JWT_SECRET (mínimo 32 caracteres) nas variáveis de ambiente.');
    process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // necessário atrás do proxy do provedor (Render, Railway etc.)
app.use(helmet({ contentSecurityPolicy: false })); // CSP desligado porque as páginas usam scripts/estilos inline
app.use(express.json({ limit: '100kb' }));

// CORS: só é necessário se o frontend ficar em OUTRO domínio.
// Se o Express serve o frontend (padrão deste pacote), pode deixar CORS_ORIGIN vazio.
const origens = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: origens.length ? origens : false }));

/* =====================================================
   BANCO DE DADOS (POOL)
===================================================== */
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: ['DATE'], // colunas DATE voltam como "2026-10-12" (sem deslocamento de fuso)
    timezone: 'Z',
    // Muitos bancos gerenciados exigem SSL. Se o seu exigir, use DB_SSL=true
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
});
pool.pool.on('connection', conn => conn.query("SET time_zone = '+00:00'"));

// Conecta e cria as tabelas automaticamente (database/schema.sql usa CREATE TABLE IF NOT EXISTS,
// então é seguro rodar a cada início e não apaga nada). Para desligar: AUTO_INIT_DB=false
async function iniciarBanco() {
    await pool.query('SELECT 1');
    console.log('Conectado ao banco MySQL com sucesso!');

    if (process.env.AUTO_INIT_DB === 'false') return;

    const arquivo = path.join(__dirname, '..', 'database', 'schema.sql');
    if (!fs.existsSync(arquivo)) {
        console.warn('schema.sql não encontrado: criação automática das tabelas ignorada.');
        return;
    }
    const comandos = fs.readFileSync(arquivo, 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
        .split(';').map(s => s.trim()).filter(Boolean);
    for (const sql of comandos) await pool.query(sql);
    console.log('Tabelas verificadas/criadas.');
}
iniciarBanco().catch(err => console.error('Erro ao conectar/preparar o banco de dados:', err.message));

/* =====================================================
   UTILITÁRIOS
===================================================== */
const txt = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const horaOk = h => typeof h === 'string' && /^\d{2}:\d{2}(:\d{2})?$/.test(h);
const dataOk = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);

const limiteAuth = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

// Middleware de autenticação: o usuário vem do TOKEN, nunca do corpo/URL da requisição
function auth(req, res, next) {
    const [tipo, token] = (req.headers.authorization || '').split(' ');
    if (tipo !== 'Bearer' || !token) return res.status(401).json({ erro: 'Não autenticado.' });
    try {
        req.userId = jwt.verify(token, JWT_SECRET).id;
        next();
    } catch {
        res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
    }
}

/* =====================================================
   AUTENTICAÇÃO
===================================================== */
app.post('/api/cadastro', limiteAuth, async (req, res) => {
    const nome = txt(req.body.nome, 100);
    const email = txt(req.body.email, 100).toLowerCase();
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

    if (!nome) return res.status(400).json({ erro: 'Informe seu nome.' });
    if (!emailOk(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter no mínimo 6 caracteres.' });
    if (senha.length > 72) return res.status(400).json({ erro: 'A senha pode ter no máximo 72 caracteres.' });

    const hash = await bcrypt.hash(senha, 10);
    try {
        await pool.execute('INSERT INTO usuarios (nome, email, senha) VALUES (?, ?, ?)', [nome, email, hash]);
        res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Este e-mail já está cadastrado.' });
        throw err;
    }
});

app.post('/api/login', limiteAuth, async (req, res) => {
    const email = txt(req.body.email, 100).toLowerCase();
    const senha = typeof req.body.senha === 'string' ? req.body.senha : '';

    const [rows] = await pool.execute('SELECT id, nome, senha FROM usuarios WHERE email = ?', [email]);
    const usuario = rows[0];
    const ok = usuario ? await bcrypt.compare(senha, usuario.senha) : false;

    // Mesma mensagem para e-mail inexistente e senha errada (evita descobrir quais e-mails existem)
    if (!ok) return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });

    const token = jwt.sign({ id: usuario.id }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ mensagem: 'Login realizado com sucesso', token, usuarioId: usuario.id, nome: usuario.nome });
});

/* =====================================================
   PACIENTES
===================================================== */
app.post('/api/pacientes', auth, async (req, res) => {
    const b = req.body;
    const nome = txt(b.nome, 100);
    const idade = (b.idade === '' || b.idade == null) ? null : parseInt(b.idade, 10);
    const peso = Number(b.peso);
    const altura = Number(b.altura); // em metros (o frontend já divide por 100)
    let sangue = txt(b.sangue, 3);
    if (sangue === '-') sangue = '';

    if (!nome) return res.status(400).json({ erro: 'Informe o nome.' });
    if (!(peso > 0 && peso < 500)) return res.status(400).json({ erro: 'Peso inválido.' });
    if (!(altura >= 0.3 && altura <= 2.7)) return res.status(400).json({ erro: 'Altura inválida.' });
    if (idade !== null && !(idade >= 0 && idade <= 130)) return res.status(400).json({ erro: 'Idade inválida.' });

    const [r] = await pool.execute(
        'INSERT INTO pacientes (nome, idade, peso, altura, sangue, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
        [nome, idade, peso, altura, sangue || null, req.userId]
    );
    res.status(201).json({ mensagem: 'Paciente salvo!', id: r.insertId });
});

app.get('/api/pacientes', auth, async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM pacientes WHERE usuario_id = ? ORDER BY id', [req.userId]);
    res.json(rows);
});

/* =====================================================
   REMÉDIOS
===================================================== */
app.post('/api/remedios', auth, async (req, res) => {
    const b = req.body;
    const nome = txt(b.nome, 100);
    if (!nome) return res.status(400).json({ erro: 'Informe o nome do remédio.' });

    await pool.execute(
        'INSERT INTO remedios (nome, dose, hora, frequencia, usuario_id) VALUES (?, ?, ?, ?, ?)',
        [nome, txt(b.dose, 50) || null, horaOk(b.hora) ? b.hora : null, txt(b.frequencia, 50) || null, req.userId]
    );
    res.status(201).json({ mensagem: 'Remédio salvo com sucesso!' });
});

app.get('/api/remedios', auth, async (req, res) => {
    const [rows] = await pool.execute('SELECT * FROM remedios WHERE usuario_id = ? ORDER BY hora', [req.userId]);
    res.json(rows);
});

/* =====================================================
   SINTOMAS
===================================================== */
app.post('/api/sintomas', auth, async (req, res) => {
    const b = req.body;
    const nome = txt(b.nome, 100);
    if (!nome) return res.status(400).json({ erro: 'Informe o que está sentindo.' });

    await pool.execute(
        'INSERT INTO sintomas (nome, nivel, observacao, usuario_id) VALUES (?, ?, ?, ?)',
        [nome, txt(b.nivel, 50) || null, txt(b.observacao, 2000) || null, req.userId]
    );
    res.status(201).json({ mensagem: 'Sintoma registrado!' });
});

app.get('/api/sintomas', auth, async (req, res) => {
    const [rows] = await pool.execute(
        'SELECT * FROM sintomas WHERE usuario_id = ? ORDER BY data_registro DESC', [req.userId]
    );
    res.json(rows);
});

/* =====================================================
   CONSULTAS
===================================================== */
app.post('/api/consultas', auth, async (req, res) => {
    const b = req.body;
    const especialidade = txt(b.especialidade, 100);
    if (!especialidade) return res.status(400).json({ erro: 'Informe a especialidade.' });
    if (!dataOk(b.data_consulta)) return res.status(400).json({ erro: 'Data inválida.' });

    await pool.execute(
        'INSERT INTO consultas (especialidade, medico, data_consulta, hora_consulta, local_consulta, usuario_id) VALUES (?, ?, ?, ?, ?, ?)',
        [
            especialidade,
            txt(b.medico, 100) || null,
            b.data_consulta,
            horaOk(b.hora_consulta) ? b.hora_consulta : null,
            txt(b.local ?? b.local_consulta, 150) || null,
            req.userId
        ]
    );
    res.status(201).json({ mensagem: 'Consulta agendada!' });
});

app.get('/api/consultas', auth, async (req, res) => {
    const [rows] = await pool.execute(
        'SELECT * FROM consultas WHERE usuario_id = ? ORDER BY data_consulta ASC, hora_consulta ASC', [req.userId]
    );
    res.json(rows);
});

/* =====================================================
   SAÚDE DO SERVIDOR, FRONTEND E ERROS
===================================================== */
/* =====================================================
   EXCLUIR REGISTROS (só apaga o que pertence ao usuário do token)
===================================================== */
const TABELAS_EXCLUIVEIS = new Set(['pacientes', 'remedios', 'sintomas', 'consultas']);

app.delete('/api/:tabela/:id', auth, async (req, res) => {
    const { tabela } = req.params;
    const id = Number(req.params.id);

    if (!TABELAS_EXCLUIVEIS.has(tabela) || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ erro: 'Requisição inválida.' });
    }

    // O nome da tabela vem da lista fixa acima (nunca direto da requisição)
    const [r] = await pool.execute(`DELETE FROM ${tabela} WHERE id = ? AND usuario_id = ?`, [id, req.userId]);
    if (r.affectedRows === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });

    res.json({ mensagem: 'Excluído com sucesso!' });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

// Serve o frontend (pasta TCC/TCC, ao lado da pasta backend)
const pastaFront = path.join(__dirname, '..', 'TCC');
app.use(express.static(pastaFront));
app.get('/', (req, res) => res.redirect('/login.html'));

// Tratador de erros: nunca devolve detalhes internos ao usuário
app.use((err, req, res, next) => {
    console.error(err);
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ erro: status === 500 ? 'Erro interno no servidor.' : 'Requisição inválida.' });
});

const porta = process.env.PORT || 3000;
app.listen(porta, '0.0.0.0', () => console.log(`Servidor rodando na porta ${porta}`));
