// RECONEXÃO COM BANCO DE DADOS GOOGLE SHEETS
const API_URL = "https://script.google.com/macros/s/AKfycbxwaoQrRhtOry9HXm5-qcIj7dQCslo3gQpkpMj0YduNdm9yQee8_3eqGFf1GGpIejfw/exec";

let reservations = [];

// CAPTURA AUTOMÁTICA DA DATA ATUAL REAL DO SISTEMA AO ABRIR O SITE
const hoje = new Date();
let currentYear = hoje.getFullYear();
let currentMonth = hoje.getMonth(); // Define o mês atual automaticamente (0 = Jan, 1 = Fev, etc.)
let selectedDateStr = null;
let idToDelete = null;

// Elementos DOM
const form = document.getElementById('schedule-form');
const editIdInput = document.getElementById('edit-id');
const formTitle = document.getElementById('form-title');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const tableBody = document.getElementById('table-body');
const emptyState = document.getElementById('empty-state');
const searchDriver = document.getElementById('search-driver');
const filterVehicle = document.getElementById('filter-vehicle');
const monthYearLabel = document.getElementById('calendar-month-year');
const daysContainer = document.getElementById('calendar-days-container');
const daySummary = document.getElementById('day-summary');
const summaryDate = document.getElementById('summary-date');
const summaryList = document.getElementById('summary-list');

document.addEventListener('DOMContentLoaded', () => {
    // Define o input de data do formulário para o dia de hoje automaticamente
    const ano = hoje.getFullYear();
    const mes = String(hoje.getMonth() + 1).padStart(2, '0');
    const dia = String(hoje.getDate()).padStart(2, '0');
    document.getElementById('travel-date').value = `${ano}-${mes}-${dia}`;

    loadDataFromSheets();
    setupEventListeners();
});

function setupEventListeners() {
    form.addEventListener('submit', handleFormSubmit);
    btnCancelEdit.addEventListener('click', resetForm);
    searchDriver.addEventListener('input', renderTable);
    filterVehicle.addEventListener('change', renderTable);
    document.getElementById('prev-month').addEventListener('click', () => changeMonth(-1));
    document.getElementById('next-month').addEventListener('click', () => changeMonth(1));
    document.getElementById('btn-print').addEventListener('click', () => window.print());
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('btn-modal-confirm').addEventListener('click', confirmDelete);
}

// BUSCAR DADOS DA PLANILHA (EM TEMPO REAL)
async function loadDataFromSheets() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        // Converter IDs vindos da planilha para formato numérico
        reservations = data.map(res => ({...res, id: Number(res.id)}));
        renderTable();
        renderCalendar();
        updateVehicleStatusCards();
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        showToast("Erro ao sincronizar com a base de dados em nuvem.", "error");
    }
}

function formatDateBR(dateStr) {
    if(!dateStr) return "";
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast hidden'; }, 4000);
}

function checkConflict(id, vehicle, date, start, end) {
    const toMinutes = (timeStr) => {
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };
    const newStart = toMinutes(start);
    const newEnd = toMinutes(end);

    if (newEnd <= newStart) {
        return { hasConflict: true, message: "O horário de retorno deve ser após o horário de saída." };
    }

    const activeConflicts = reservations.filter(res => {
        return res.id !== id && res.vehicle === vehicle && res.date === date;
    });

    for (const res of activeConflicts) {
        const existStart = toMinutes(res.departure);
        const existEnd = toMinutes(res.returnTime);
        if (newStart < existEnd && newEnd > existStart) {
            return { hasConflict: true, message: "Este veículo já está reservado neste período." };
        }
    }
    return { hasConflict: false };
}

// ATUALIZAR STATUS DOS CARDS EM TEMPO REAL COM A DATA DE HOJE
function updateVehicleStatusCards() {
    const agora = new Date();
    
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    const dataAtualReal = `${ano}-${mes}-${dia}`;
    
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const horarioAtualReal = `${horas}:${minutos}`;
    
    const toMinutes = (timeStr) => {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return h * 60 + m;
    };
    const nowMin = toMinutes(horarioAtualReal);

    let v1Occupied = false;
    let v2Occupied = false;

    reservations.forEach(res => {
        if (res.date === dataAtualReal) {
            const start = toMinutes(res.departure);
            const end = toMinutes(res.returnTime);
            if (nowMin >= start && nowMin <= end) {
                if (res.vehicle === "Oroch 2") v1Occupied = true;
                if (res.vehicle === "Oroch 3") v2Occupied = true;
            }
        }
    });
    updateCardDOM("v1", v1Occupied);
    updateCardDOM("v2", v2Occupied);
}

function updateCardDOM(prefix, isOccupied) {
    const card = document.getElementById(`card-${prefix}`);
    const badge = document.getElementById(`badge-${prefix}`);
    if (isOccupied) {
        card.style.borderLeftColor = "var(--danger)";
        badge.className = "status-badge status-occupied";
        badge.textContent = "Ocupado Agora";
    } else {
        card.style.borderLeftColor = "var(--success)";
        badge.className = "status-badge status-available";
        badge.textContent = "Disponível Agora";
    }
}

// ENVIAR DADOS CRIAÇÃO / EDIÇÃO PARA O GOOGLE SHEETS
async function handleFormSubmit(e) {
    e.preventDefault();

    const id = editIdInput.value ? Number(editIdInput.value) : Date.now();
    const driver = document.getElementById('driver-name').value.trim();
    const vehicle = document.getElementById('vehicle-select').value;
    const destination = document.getElementById('destination').value.trim();
    const date = document.getElementById('travel-date').value;
    const departure = document.getElementById('time-departure').value;
    const returnTime = document.getElementById('time-return').value;
    const observation = document.getElementById('observation').value.trim();

    const conflictCheck = checkConflict(editIdInput.value ? id : null, vehicle, date, departure, returnTime);
    if (conflictCheck.hasConflict) {
        showToast(conflictCheck.message, 'error');
        return;
    }

    const actionType = editIdInput.value ? "update" : "create";
    const payload = { action: actionType, id, driver, vehicle, destination, date, departure, returnTime, observation };

    showToast("A sincronizar com a nuvem...", "warning");

    try {
        await fetch(API_URL, {
            method: "POST",
            mode: "no-cors",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        showToast("Agendamento guardado com sucesso!", "success");
        resetForm();
        setTimeout(loadDataFromSheets, 1000);
    } catch (error) {
        showToast("Erro ao guardar na nuvem.", "error");
    }
}

function resetForm() {
    form.reset();
    editIdInput.value = "";
    formTitle.textContent = "Nova Reserva";
    btnCancelEdit.classList.add('hidden');
    
    // Mantém a data de hoje activa após limpar o formulário
    const d = new Date();
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    document.getElementById('travel-date').value = `${ano}-${mes}-${dia}`;
}

function editReservation(id) {
    const res = reservations.find(r => r.id === id);
    if (!res) return;

    editIdInput.value = res.id;
    document.getElementById('driver-name').value = res.driver;
    document.getElementById('vehicle-select').value = res.vehicle;
    document.getElementById('destination').value = res.destination;
    document.getElementById('travel-date').value = res.date;
    document.getElementById('time-departure').value = res.departure;
    document.getElementById('time-return').value = res.returnTime;
    document.getElementById('observation').value = res.observation;

    formTitle.textContent = "Editar Agendamento";
    btnCancelEdit.classList.remove('hidden');
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
}

function openDeleteModal(id) {
    const res = reservations.find(r => r.id === id);
    if (!res) return;
    idToDelete = id;
    document.getElementById('modal-driver-name').textContent = res.driver;
    document.getElementById('delete-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('delete-modal').classList.remove('active');
    idToDelete = null;
}

async function confirmDelete() {
    if (idToDelete !== null) {
        showToast("A eliminar da nuvem...", "warning");
        try {
            await fetch(API_URL, {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", id: idToDelete })
            });
            showToast("Agendamento excluído com sucesso!", "success");
            closeModal();
            setTimeout(loadDataFromSheets, 1000);
        } catch (error) {
            showToast("Erro ao eliminar da nuvem.", "error");
        }
    }
}

function renderTable() {
    const filterText = searchDriver.value.toLowerCase();
    const targetVehicle = filterVehicle.value;

    const filtered = reservations.filter(res => {
        const matchesDriver = res.driver && res.driver.toLowerCase().includes(filterText);
        const matchesVehicle = targetVehicle === 'todos' || res.vehicle === targetVehicle;
        return matchesDriver && matchesVehicle;
    });

    filtered.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.departure).localeCompare(String(b.departure)));
    tableBody.innerHTML = "";

    if (filtered.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    emptyState.classList.add('hidden');

    filtered.forEach(res => {
        const tr = document.createElement('tr');
        const vehicleClass = res.vehicle === 'Oroch 2' ? 'tag-v1' : 'tag-v2';

        tr.innerHTML = `
            <td style="font-weight: 600;">${res.driver}</td>
            <td><span class="vehicle-tag ${vehicleClass}">${res.vehicle}</span></td>
            <td title="${res.destination}">${res.destination}</td>
            <td>${formatDateBR(res.date)}</td>
            <td>${res.departure}</td>
            <td>${res.returnTime}</td>
            <td title="${res.observation || ''}">${res.observation || '<span style="color:#cbd5e1; font-style:italic;">Sem obs</span>'}</td>
            <td class="actions-column">
                <div class="table-actions">
                    <button type="button" class="btn-icon" style="color:var(--primary-light)" onclick="editReservation(${res.id})" title="Editar">
                        <span class="material-symbols-outlined">edit</span>
                    </button>
                    <button type="button" class="btn-icon" style="color:var(--danger)" onclick="openDeleteModal(${res.id})" title="Excluir">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

const monthsBR = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function renderCalendar() {
    monthYearLabel.textContent = `${monthsBR[currentMonth]} ${currentYear}`;
    daysContainer.innerHTML = "";

    const hojeReal = new Date();
    const hojeAno = hojeReal.getFullYear();
    const hojeMes = hojeReal.getMonth();
    const hojeDia = hojeReal.getDate();

    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const div = document.createElement('div');
        div.className = 'calendar-day empty';
        daysContainer.appendChild(div);
    }

    for (let day = 1; day <= totalDays; day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        const currentMonthStr = String(currentMonth + 1).padStart(2, '0');
        const currentDayStr = String(day).padStart(2, '0');
        const dateString = `${currentYear}-${currentMonthStr}-${currentDayStr}`;

        dayDiv.innerHTML = `<span>${day}</span>`;

        // Destaca dinamicamente o dia de hoje real no calendário
        if (day === hojeDia && currentMonth === hojeMes && currentYear === hojeAno) {
            dayDiv.classList.add('today');
        }

        const dayReservations = reservations.filter(res => res.date === dateString);
        
        if (dayReservations.length > 0) {
            dayDiv.classList.add('occupied');
            const dotsContainer = document.createElement('div');
            dotsContainer.className = 'day-dots';
            
            const v1Has = dayReservations.some(r => r.vehicle === 'Oroch 2');
            const v2Has = dayReservations.some(r => r.vehicle === 'Oroch 3');
            
            if (v1Has) dotsContainer.innerHTML += '<span class="dot dot-v1"></span>';
            if (v2Has) dotsContainer.innerHTML += '<span class="dot dot-v2"></span>';
            dayDiv.appendChild(dotsContainer);
        }

        if (selectedDateStr === dateString) {
            dayDiv.classList.add('selected');
            showDaySummary(dateString, dayReservations);
        }

        dayDiv.addEventListener('click', () => {
            document.querySelectorAll('.calendar-day').forEach(d => d.classList.remove('selected'));
            dayDiv.classList.add('selected');
            selectedDateStr = dateString;
            showDaySummary(dateString, dayReservations);
        });
        daysContainer.appendChild(dayDiv);
    }
}

function changeMonth(direction) {
    currentMonth += direction;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

function showDaySummary(dateStr, dayReservations) {
    daySummary.classList.remove('hidden');
    summaryDate.textContent = formatDateBR(dateStr);
    summaryList.innerHTML = "";

    if (dayReservations.length === 0) {
        summaryList.innerHTML = `<li style="border:none; color:var(--text-muted);">Nenhum veículo reservado para este dia.</li>`;
        return;
    }

    dayReservations.sort((a,b) => String(a.departure).localeCompare(String(b.departure))).forEach(res => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span><strong>${res.departure} - ${res.returnTime}</strong>: ${res.vehicle}</span>
            <span style="color:var(--text-muted); font-size:0.8rem;">Motorista: ${res.driver}</span>
        `;
        summaryList.appendChild(li);
    });
}

// ATUALIZAÇÃO AUTOMÁTICA EM TEMPO REAL (SEM RECARREGAR A PÁGINA)
// Executa a busca de dados na planilha a cada 15 segundos
setInterval(() => {
    // Só sincroniza se o usuário não estiver editando um formulário no momento
    if (!editIdInput.value) {
        loadDataFromSheets();
    }
}, 15000);
