// Mesmo domínio do site (o Express serve o frontend). Se a API ficar em outro domínio, troque aqui.
const API = '/api';

document.getElementById('login-form').addEventListener('submit', async function (event) {
    event.preventDefault();

    const email = document.getElementById('username').value.trim();
    const senha = document.getElementById('password').value;
    const erroMsg = document.getElementById('error-message');
    const botao = document.getElementById('btn-entrar');

    erroMsg.style.display = 'none';

    if (!email || !senha) {
        erroMsg.textContent = 'Preencha o e-mail e a senha.';
        erroMsg.style.display = 'block';
        return;
    }

    botao.disabled = true;
    try {
        const resposta = await fetch(API + '/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        const dados = await resposta.json();

        if (resposta.ok) {
            // O index.html procura o token e o id para liberar o painel
            localStorage.setItem('token', dados.token);
            localStorage.setItem('usuarioId', dados.usuarioId);
            localStorage.setItem('usuarioNome', dados.nome || '');
            window.location.href = 'index.html';
        } else {
            erroMsg.textContent = dados.erro || 'Não foi possível entrar.';
            erroMsg.style.display = 'block';
            document.getElementById('password').value = '';
        }
    } catch (erro) {
        console.error('Erro ao fazer login:', erro);
        erroMsg.textContent = 'Erro ao conectar com o servidor.';
        erroMsg.style.display = 'block';
    } finally {
        botao.disabled = false;
    }
});
