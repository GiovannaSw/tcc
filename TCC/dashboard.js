/* =====================================================
   SAÚDE EM DIA - LÓGICA DO PAINEL
   (substitui o <script> que ficava dentro do index.html)
===================================================== */

// A API fica no mesmo domínio do site (o Express serve o frontend), então o caminho é relativo.
// Se um dia o backend ficar em outro domínio, troque por: const API = 'https://sua-api.com/api';
const API = '/api';

/* ---------- 1. PROTEÇÃO DE ROTA ---------- */
const token = localStorage.getItem('token');
const usuarioId = localStorage.getItem('usuarioId');
if (!token) {
    alert('Você precisa fazer login para acessar o painel.');
    window.location.href = 'login.html';
}

function sair() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuarioId');
    localStorage.removeItem('usuarioNome');
    window.location.href = 'login.html';
}

/* ---------- 2. UTILITÁRIOS ---------- */

// Evita XSS: tudo que o usuário digitou passa por aqui antes de entrar em innerHTML
function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// fetch que já manda o token e trata sessão expirada
async function api(caminho, opcoes = {}) {
    const resposta = await fetch(API + caminho, {
        ...opcoes,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            ...(opcoes.headers || {})
        }
    });
    if (resposta.status === 401) {
        alert('Sua sessão expirou. Faça login novamente.');
        sair();
        throw new Error('401');
    }
    let dados = null;
    try { dados = await resposta.json(); } catch (e) { /* sem corpo */ }
    return { ok: resposta.ok, dados };
}

const vazio = msg => `<div style="color:var(--text-muted); text-align:center; padding:20px; font-size:1.2rem;">${msg}</div>`;

/* ---------- 2.1 EXCLUIR (LIXEIRA) ---------- */

// Estilo do botão de lixeira (injetado aqui para você não precisar mexer no CSS)
(function () {
    const s = document.createElement('style');
    s.textContent = `
        .btn-lixeira {
            background: transparent;
            border: none;
            font-size: 1.5rem;
            line-height: 1;
            cursor: pointer;
            padding: 10px 12px;
            border-radius: 12px;
            margin-left: 15px;
            flex-shrink: 0;
            transition: 0.2s;
        }
        .btn-lixeira:hover { background: rgba(231, 76, 60, 0.15); transform: scale(1.15); }
        .btn-lixeira:focus-visible { outline: 3px solid var(--danger); }
    `;
    document.head.appendChild(s);
})();

const recarregar = {
    remedios: () => carregarRemedios(),
    sintomas: () => carregarSintomas(),
    consultas: () => carregarConsultas(),
    pacientes: () => carregarPacientes()
};


async function excluirItem(tabela, id) {
    const nomes = {
        remedios: 'este remédio',
        sintomas: 'esta anotação',
        consultas: 'esta consulta',
        pacientes: 'esta pessoa'
    };

    const mensagem = `Tem certeza que deseja excluir ${nomes[tabela]}?`;

    // Utiliza a confirmação personalizada do index.html
    const resposta = await confirmar(mensagem);

    if (!resposta) return;

    try {
        const { ok, dados } = await api(`/${tabela}/${id}`, {
            method: 'DELETE'
        });

        if (ok) {
            await recarregar[tabela]();
            mostrarAviso('Excluído com sucesso!', 'sucesso');
        } else {
            mostrarAviso(
                'Erro ao excluir: ' + ((dados && dados.erro) || 'tente novamente.'),
                'erro'
            );
        }
    } catch (erro) {
        if (erro.message !== '401') {
            mostrarAviso('Erro ao conectar com o servidor.', 'erro');
        }
    }
}

/* ---------- 3. ABAS ---------- */
function abrirAba(id, element) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    element.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- 4. PERFIS E DASHBOARD ---------- */
let todosPerfis = [];
let idPerfilAtivo = localStorage.getItem('id_perfil_ativo_' + usuarioId) || null;

async function salvarPerfil() {
    const nome = document.getElementById('p_nome').value;
    const idade = document.getElementById('p_idade').value;
    const peso = document.getElementById('p_peso').value;
    const altura = document.getElementById('p_altura').value;
    const sangue = document.getElementById('p_sangue').value;

    if (!nome || !peso || !altura) {
        return alert('Por favor, preencha seu Nome, Peso e Altura!');
    }

    try {
        const { ok, dados } = await api('/pacientes', {
            method: 'POST',
            body: JSON.stringify({
                nome,
                idade,
                peso: parseFloat(peso),
                altura: parseFloat(altura) / 100,
                sangue
            })
        });
        if (ok) {
            alert(dados.mensagem);
            await carregarPacientes();
            document.querySelectorAll('#secao-perfis input').forEach(i => i.value = '');
            document.getElementById('p_sangue').value = '';
        } else {
            alert('Erro ao salvar: ' + (dados && dados.erro));
        }
    } catch (erro) {
        if (erro.message !== '401') alert('Erro ao conectar com o servidor.');
    }
}

function selecionarPerfil(id) {
    idPerfilAtivo = id;
    localStorage.setItem('id_perfil_ativo_' + usuarioId, id);
    renderizarPerfis();
    atualizarDashboard();
}

function renderizarPerfis() {
    const container = document.getElementById('listaPerfisContainer');
    if (todosPerfis.length === 0) {
        container.innerHTML = vazio('Nenhuma pessoa cadastrada.');
        return;
    }
    container.innerHTML = todosPerfis.map(p => {
        const isAtivo = p.id == idPerfilAtivo;
        return `
            <div style="background:${isAtivo ? '#e6f0fa' : 'var(--card-bg)'}; border:2px solid ${isAtivo ? 'var(--primary)' : 'var(--border-color)'}; padding:20px; border-radius:12px; cursor:pointer; display:flex; justify-content:space-between; align-items:center;" onclick="selecionarPerfil(${Number(p.id)})">
                <div>
                    <strong style="color:${isAtivo ? '#2c3e50' : 'var(--text-main)'}; font-size:1.2rem;">${esc(p.nome)}</strong>
                    <div style="font-size:14px; color:${isAtivo ? '#5c6c7c' : 'var(--text-muted)'}; margin-top:5px;">${p.idade != null ? esc(p.idade) + ' anos | ' : ''}${esc(Number(p.peso))} kg</div>
                </div>
                <button class="btn-lixeira" title="Excluir" aria-label="Excluir pessoa" onclick="event.stopPropagation(); excluirItem('pacientes', ${Number(p.id)})">🗑️</button>
            </div>`;
    }).join('');
}

function atualizarDashboard() {
    const perfil = todosPerfis.find(p => p.id == idPerfilAtivo);
    document.querySelectorAll('.imc-table tr').forEach(tr => tr.classList.remove('imc-ativo'));

    if (perfil) {
        const peso = Number(perfil.peso);
        const altura = Number(perfil.altura);
        document.getElementById('labelNomeAtivo').innerText = perfil.nome;
        document.getElementById('labelSangue').innerText = perfil.sangue || '-';
        document.getElementById('dash-peso').innerText = peso + 'kg';

        const imc = peso / (altura * altura);
        document.getElementById('dash-imc').innerText = isFinite(imc) ? imc.toFixed(1) : '-';

        if (isFinite(imc)) {
            if (imc < 18.5) document.getElementById('row-1').classList.add('imc-ativo');
            else if (imc < 25) document.getElementById('row-2').classList.add('imc-ativo');
            else if (imc < 30) document.getElementById('row-3').classList.add('imc-ativo');
            else document.getElementById('row-4').classList.add('imc-ativo');
        }
    } else {
        document.getElementById('labelNomeAtivo').innerText = localStorage.getItem('usuarioNome') || 'Visitante';
        document.getElementById('labelSangue').innerText = '-';
        document.getElementById('dash-peso').innerText = '-';
        document.getElementById('dash-imc').innerText = '-';
    }
}

/* ---------- 5. CARREGAR DADOS (a API já filtra pelo usuário do token) ---------- */
async function carregarPacientes() {
    try {
        const { ok, dados } = await api('/pacientes');
        if (!ok) return;
        todosPerfis = dados;
        // se o perfil salvo não existe mais, usa o primeiro da lista
        if (!todosPerfis.some(p => p.id == idPerfilAtivo)) {
            idPerfilAtivo = todosPerfis.length ? todosPerfis[0].id : null;
        }
        renderizarPerfis();
        atualizarDashboard();
    } catch (erro) { console.error('Erro ao buscar pacientes', erro); }
}

async function carregarRemedios() {
    try {
        const { ok, dados: remedios } = await api('/remedios');
        if (!ok) return;
        const lista = document.getElementById('listaRemediosVisual');
        if (remedios.length === 0) return (lista.innerHTML = vazio('Nenhum remédio anotado.'));

        lista.innerHTML = remedios.map(rem => `
            <div class="item-lista">
                <div class="item-lista-desc">
                    <strong style="color:var(--text-main); font-size:1.3rem;">
                        ${esc(rem.nome)} ${rem.dose ? `<span style="color:var(--primary);">(${esc(rem.dose)})</span>` : ''}
                    </strong>
                    <span style="font-size:1.1rem; color:var(--text-muted);">
                        🕒 Tomar às: <b>${rem.hora ? esc(rem.hora.slice(0, 5)) : '--:--'}</b> | 🔁 ${esc(rem.frequencia || 'Uso único')}
                    </span>
                </div>
                <button class="btn-lixeira" title="Excluir" aria-label="Excluir remédio" onclick="excluirItem('remedios', ${Number(rem.id)})">🗑️</button>
            </div>`).join('');
    } catch (erro) { console.error('Erro ao buscar remédios', erro); }
}

async function carregarSintomas() {
    try {
        const { ok, dados: sintomas } = await api('/sintomas');
        if (!ok) return;
        const lista = document.getElementById('listaSintomasVisual');
        if (sintomas.length === 0) return (lista.innerHTML = vazio('Nenhuma dor anotada. Que bom!'));

        lista.innerHTML = sintomas.map(sin => {
            const corBorda = (sin.nivel && sin.nivel.includes('Forte')) ? 'var(--danger)' : '#f39c12';
            const dataFormatada = new Date(sin.data_registro).toLocaleDateString('pt-BR');
            return `
                <div class="item-lista" style="border-left-color: ${corBorda};">
                    <div class="item-lista-desc">
                        <strong style="color:var(--text-main); font-size:1.3rem;">${esc(sin.nome)}</strong>
                        <span style="font-size:1.1rem; color:var(--text-muted);">
                            📅 Registrado em: ${dataFormatada} | Dor: <b>${esc(sin.nivel || 'Não informou')}</b>
                        </span>
                        ${sin.observacao ? `<span style="font-size:1rem; color:var(--text-muted);">📝 ${esc(sin.observacao)}</span>` : ''}
                    </div>
                    <button class="btn-lixeira" title="Excluir" aria-label="Excluir anotação" onclick="excluirItem('sintomas', ${Number(sin.id)})">🗑️</button>
                </div>`;
        }).join('');
    } catch (erro) { console.error('Erro ao buscar sintomas', erro); }
}

async function carregarConsultas() {
    try {
        const { ok, dados: consultas } = await api('/consultas');
        if (!ok) return;
        const lista = document.getElementById('listaConsultasVisual');
        if (consultas.length === 0) return (lista.innerHTML = vazio('Nenhuma consulta marcada.'));

        lista.innerHTML = consultas.map(con => {
            // o servidor devolve a data como "AAAA-MM-DD"; formatamos sem passar por fuso horário
            const [a, m, d] = String(con.data_consulta).slice(0, 10).split('-');
            const dataFormatada = `${d}/${m}/${a}`;
            return `
                <div class="item-lista" style="border-left-color: #9c27b0;">
                    <div class="item-lista-desc">
                        <strong style="color:var(--text-main); font-size:1.3rem;">
                            ${esc(con.especialidade)} ${con.medico ? `<span style="color:var(--primary);">com Dr(a). ${esc(con.medico)}</span>` : ''}
                        </strong>
                        <span style="font-size:1.1rem; color:var(--text-muted);">
                            📅 Dia <b>${dataFormatada}</b> às 🕒 <b>${con.hora_consulta ? esc(con.hora_consulta.slice(0, 5)) : '--:--'}</b>
                            ${con.local_consulta ? ' | 📍 ' + esc(con.local_consulta) : ''}
                        </span>
                    </div>
                    <button class="btn-lixeira" title="Excluir" aria-label="Excluir consulta" onclick="excluirItem('consultas', ${Number(con.id)})">🗑️</button>
                </div>`;
        }).join('');
    } catch (erro) { console.error('Erro ao buscar consultas', erro); }
}

/* ---------- 6. INSERIR DADOS ---------- */
async function addRemedio() {
    const nome = document.getElementById('rem_nome').value;
    const dose = document.getElementById('rem_dose').value;
    const hora = document.getElementById('rem_hora').value;
    const freq = document.getElementById('rem_freq').value;

    if (!nome) return alert('Por favor, digite o nome do remédio.');

    try {
        const { ok, dados } = await api('/remedios', {
            method: 'POST',
            body: JSON.stringify({ nome, dose, hora, frequencia: freq })
        });
        if (ok) {
            alert(dados.mensagem);
            carregarRemedios();
            document.querySelectorAll('#remedios input, #remedios select').forEach(i => i.value = '');
        } else {
            alert('Erro: ' + (dados && dados.erro));
        }
    } catch (erro) { console.error(erro); }
}

async function addSintoma() {
    const nome = document.getElementById('sin_nome').value;
    const nivel = document.getElementById('sin_nivel').value;
    const observacao = document.getElementById('sin_obs').value;

    if (!nome) return alert('Por favor, diga o que está sentindo.');

    try {
        const { ok, dados } = await api('/sintomas', {
            method: 'POST',
            body: JSON.stringify({ nome, nivel, observacao })
        });
        if (ok) {
            alert(dados.mensagem);
            carregarSintomas();
            document.querySelectorAll('#sintomas input, #sintomas select, #sintomas textarea').forEach(i => i.value = '');
        } else {
            alert('Erro: ' + (dados && dados.erro));
        }
    } catch (erro) { console.error(erro); }
}

async function addConsulta() {
    const especialidade = document.getElementById('con_espec').value;
    const medico = document.getElementById('con_medico').value;
    const data_consulta = document.getElementById('con_data').value;
    const hora_consulta = document.getElementById('con_hora').value;
    const local = document.getElementById('con_local').value;

    if (!especialidade || !data_consulta) return alert('Por favor, preencha a especialidade e a data da consulta.');

    try {
        const { ok, dados } = await api('/consultas', {
            method: 'POST',
            body: JSON.stringify({ especialidade, medico, data_consulta, hora_consulta, local })
        });
        if (ok) {
            alert('Consulta marcada com sucesso!');
            carregarConsultas();
            document.querySelectorAll('#consultas input').forEach(i => i.value = '');
        } else {
            alert('Erro: ' + (dados && dados.erro));
        }
    } catch (erro) { console.error(erro); }
}

/* ---------- 7. ACESSIBILIDADE ---------- */
let tamanhoFonteBase = 16;
function alterarFonte(direcao) {
    tamanhoFonteBase += direcao * 2;
    if (tamanhoFonteBase < 14) tamanhoFonteBase = 14;
    if (tamanhoFonteBase > 24) tamanhoFonteBase = 24;
    document.documentElement.style.fontSize = tamanhoFonteBase + 'px';
}

function toggleModoNoturno() {
    const checkbox = document.getElementById('toggle-noturno');
    document.body.classList.toggle('modo-noturno', checkbox.checked);
}

/* ---------- 8. INICIALIZAÇÃO ---------- */
window.onload = () => {
    if (!token) return;
    carregarPacientes();
    carregarRemedios();
    carregarSintomas();
    carregarConsultas();
};
