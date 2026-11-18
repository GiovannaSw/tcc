// Função para simular o salvamento de sintomas
function salvarSintoma() {
    const texto = document.getElementById('sintoma-input').value;
    
    if (texto.trim() === "") {
        alert("Por favor, descreva como está se sentindo.");
        return;
    }

    // Aqui você faria o fetch() para enviar ao seu Back-end/Node.js
    console.log("Enviando para o banco de dados:", texto);
    
    alert("Sintoma registrado com sucesso!");
    document.getElementById('sintoma-input').value = "";
}

// Simulação de abertura de modal para novos medicamentos
function abrirModal() {
    let nomeMedicamento = prompt("Nome do Medicamento:");
    let horario = prompt("Horário (ex: 18:00):");

    if (nomeMedicamento && horario) {
        const lista = document.getElementById('lista-remedios');
        const novoItem = document.createElement('li');
        novoItem.innerHTML = `<strong>${horario}</strong> - ${nomeMedicamento}`;
        lista.appendChild(novoItem);
    }
}
