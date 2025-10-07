/**
 * UFV User Manager - Frontend Logic
 */

// ============= ESTADO GLOBAL =============
let currentPage = 1;
let totalPages = 1;
let totalUsers = 0;
let selectedUserIds = new Set();
let currentUsers = []; // Usuarios de la página actual
let choicesInstance = null;

// ============= INICIALIZACIÓN =============
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 UFV User Manager iniciado');
    
    // Cargar selección desde localStorage
    loadSelectionFromStorage();
    
    // Inicializar filtro de cursos
    initCourseFilter();
    
    // Cargar primera página
    loadUsers(1);
    
    // Event listeners
    document.getElementById('btnPrevious').addEventListener('click', () => {
        if (currentPage > 1) {
            loadUsers(currentPage - 1);
        }
    });
    
    document.getElementById('btnNext').addEventListener('click', () => {
        if (currentPage < totalPages) {
            loadUsers(currentPage + 1);
        }
    });
    
    document.getElementById('btnExport').addEventListener('click', exportSelected);
    
    document.getElementById('selectAllPage').addEventListener('change', (e) => {
        toggleSelectAllPage(e.target.checked);
    });
});

// ============= FILTRO DE CURSOS =============
async function initCourseFilter() {
    try {
        const response = await fetch('/api/courses');
        const data = await response.json();
        
        const select = document.getElementById('courseFilter');
        
        // Configurar Choices.js
        choicesInstance = new Choices(select, {
            removeItemButton: true,
            searchEnabled: true,
            searchPlaceholderValue: 'Buscar curso...',
            noResultsText: 'No se encontraron cursos',
            itemSelectText: 'Click para seleccionar',
            placeholder: true,
            placeholderValue: 'Selecciona cursos para filtrar',
            searchFields: ['label'],
            fuseOptions: {
                threshold: 0.3,
                distance: 100
            }
        });
        
        // Añadir opciones
        const choices = data.courses.map(course => ({
            value: course,
            label: course
        }));
        
        choicesInstance.setChoices(choices, 'value', 'label', true);
        
        // Event listener para cambios
        select.addEventListener('change', () => {
            currentPage = 1; // Resetear a página 1 al filtrar
            loadUsers(1);
        });
        
        console.log(`✅ Filtro cargado: ${data.courses.length} cursos`);
        
    } catch (error) {
        console.error('❌ Error cargando cursos:', error);
        alert('Error cargando lista de cursos');
    }
}

// ============= CARGA DE USUARIOS =============
async function loadUsers(page) {
    console.log(`📥 Cargando página ${page}...`);
    
    // Mostrar loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('paginationContainer').style.display = 'none';
    
    try {
        // Obtener cursos seleccionados
        const selectedCourses = choicesInstance ? choicesInstance.getValue(true) : [];
        const coursesParam = selectedCourses.join(',');
        
        // Construir URL
        let url = `/api/users?page=${page}&per_page=50`;
        if (coursesParam) {
            url += `&courses=${encodeURIComponent(coursesParam)}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        // Actualizar estado
        currentPage = data.pagination.page;
        totalPages = data.pagination.total_pages;
        totalUsers = data.pagination.total;
        currentUsers = data.users;
        
        // Renderizar
        renderUsers(data.users);
        updatePagination(data.pagination);
        updateStats();
        
        // Mostrar tabla
        document.getElementById('loading').style.display = 'none';
        document.getElementById('tableContainer').style.display = 'block';
        document.getElementById('paginationContainer').style.display = 'block';
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        console.log(`✅ Página ${page} cargada: ${data.users.length} usuarios`);
        
    } catch (error) {
        console.error('❌ Error cargando usuarios:', error);
        document.getElementById('loading').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i> Error cargando usuarios. 
                Verifica que el servidor esté ejecutándose.
            </div>
        `;
    }
}

// ============= RENDERIZADO =============
function renderUsers(users) {
    const tbody = document.getElementById('userTableBody');
    tbody.innerHTML = '';
    
    users.forEach(user => {
        const row = createUserRow(user);
        tbody.appendChild(row);
    });
    
    // Actualizar checkbox de "seleccionar todo"
    updateSelectAllCheckbox();
    
    // Configurar event delegation para los botones de cursos
    setupCourseButtons();
}

function setupCourseButtons() {
    // Remover listener anterior si existe
    const tbody = document.getElementById('userTableBody');
    
    // Event delegation: escuchar clicks en todos los botones .show-all-courses
    tbody.addEventListener('click', function(e) {
        // Verificar si el click fue en un botón de "ver más cursos"
        const button = e.target.closest('.show-all-courses');
        if (!button) return;
        
        // Obtener todos los cursos del data attribute
        const allCoursesJson = button.getAttribute('data-all-courses');
        if (!allCoursesJson) return;
        
        try {
            const courses = JSON.parse(allCoursesJson);
            showCoursesModal(courses, button);
        } catch (error) {
            console.error('Error parsing courses:', error);
        }
    });
}

function showCoursesModal(courses, button) {
    // Destruir popover anterior si existe
    let popover = bootstrap.Popover.getInstance(button);
    if (popover) {
        popover.dispose();
    }
    
    // Crear contenido HTML
    const coursesHtml = courses.map(c => 
        `<div class="course-item">${escapeHtml(c)}</div>`
    ).join('');
    
    // Crear nuevo popover
    popover = new bootstrap.Popover(button, {
        html: true,
        placement: 'left',
        title: `Todos los cursos (${courses.length})`,
        content: `<div class="courses-popover-content">${coursesHtml}</div>`,
        trigger: 'manual', // Manual para control total
        sanitize: false
    });
    
    // Mostrar popover
    popover.show();
    
    // Cerrar al hacer click fuera
    const closePopover = (e) => {
        if (!button.contains(e.target) && !document.querySelector('.popover')?.contains(e.target)) {
            popover.hide();
            document.removeEventListener('click', closePopover);
        }
    };
    
    // Esperar un tick para que el popover se renderice
    setTimeout(() => {
        document.addEventListener('click', closePopover);
    }, 100);
}


function createUserRow(user) {
    const tr = document.createElement('tr');
    
    // Checkbox
    const isSelected = selectedUserIds.has(user.user_id);
    
    tr.innerHTML = `
        <td>
            <input type="checkbox" 
                   class="form-check-input user-checkbox" 
                   data-user-id="${user.user_id}"
                   ${isSelected ? 'checked' : ''}>
        </td>
        <td><strong>${user.user_id}</strong></td>
        <td>${escapeHtml(user.name)}</td>
        <td><small>${escapeHtml(user.email)}</small></td>
        <td><small>${user.created_at_display}</small></td>
        <td><small>${user.last_login_display}</small></td>
        <td class="text-center">
            <span class="badge ${user.num_courses === 0 ? 'bg-secondary' : 'bg-primary'}">
                ${user.num_courses}
            </span>
        </td>
        <td>
            ${renderCourses(user.course_codes, user.num_courses)}
        </td>
    `;
    
    // Event listener para checkbox
    const checkbox = tr.querySelector('.user-checkbox');
    checkbox.addEventListener('change', (e) => {
        toggleUserSelection(user.user_id, e.target.checked);
    });
    
    return tr;
}

function renderCourses(courseCodesStr, numCourses) {
    if (numCourses === 0 || !courseCodesStr) {
        return '<span class="no-courses">Sin cursos</span>';
    }
    
    // Split y mostrar solo primeros 3
    const courses = courseCodesStr.split(', ');
    const displayCourses = courses.slice(0, 3);
    const remaining = courses.length - 3;
    
    let html = displayCourses.map(c => 
        `<span class="course-badge">${escapeHtml(c)}</span>`
    ).join(' ');
    
    if (remaining > 0) {
        // Guardar todos los cursos en data attribute
        const allCoursesJson = JSON.stringify(courses);
        
        html += ` <button type="button" 
                        class="btn btn-sm btn-outline-secondary show-all-courses" 
                        data-all-courses='${escapeHtml(allCoursesJson)}'>
                    +${remaining} más
                </button>`;
    }
    
    return html;
}



// ============= SELECCIÓN DE USUARIOS =============
function toggleUserSelection(userId, selected) {
    if (selected) {
        selectedUserIds.add(userId);
    } else {
        selectedUserIds.delete(userId);
    }
    
    updateStats();
    saveSelectionToStorage();
}

function toggleSelectAllPage(selected) {
    currentUsers.forEach(user => {
        toggleUserSelection(user.user_id, selected);
    });
    
    // Actualizar checkboxes visuales
    document.querySelectorAll('.user-checkbox').forEach(cb => {
        cb.checked = selected;
    });
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllPage');
    
    if (currentUsers.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.disabled = true;
        return;
    }
    
    selectAllCheckbox.disabled = false;
    
    // Verificar si todos los usuarios de la página están seleccionados
    const allSelected = currentUsers.every(user => 
        selectedUserIds.has(user.user_id)
    );
    
    selectAllCheckbox.checked = allSelected;
}

// ============= PAGINACIÓN =============
function updatePagination(pagination) {
    document.getElementById('pageInfo').textContent = 
        `Página ${pagination.page} de ${pagination.total_pages}`;
    
    document.getElementById('btnPrevious').disabled = (pagination.page === 1);
    document.getElementById('btnNext').disabled = (pagination.page === pagination.total_pages);
}

// ============= ESTADÍSTICAS =============
function updateStats() {
    // Total cargado al inicio
    const totalUsersElement = document.getElementById('totalUsers');
    if (totalUsersElement.textContent === '-') {
        fetch('/api/users?page=1&per_page=1')
            .then(r => r.json())
            .then(d => {
                totalUsersElement.textContent = d.pagination.total.toLocaleString();
            });
    }
    
    document.getElementById('filteredUsers').textContent = totalUsers.toLocaleString();
    document.getElementById('selectedCount').textContent = selectedUserIds.size;
    document.getElementById('exportCount').textContent = selectedUserIds.size;
    
    // Habilitar/deshabilitar botón de exportar
    document.getElementById('btnExport').disabled = (selectedUserIds.size === 0);
}

// ============= EXPORTAR =============
async function exportSelected() {
    if (selectedUserIds.size === 0) {
        alert('No hay usuarios seleccionados para exportar');
        return;
    }
    
    const confirmed = confirm(
        `¿Exportar ${selectedUserIds.size} usuarios seleccionados?\n\n` +
        'Se generará un archivo CSV con los datos de estos usuarios.'
    );
    
    if (!confirmed) return;
    
    try {
        const response = await fetch('/api/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                user_ids: Array.from(selectedUserIds)
            })
        });
        
        if (!response.ok) {
            throw new Error('Error en la exportación');
        }
        
        // Descargar archivo
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup_usuarios_ufv_${new Date().getTime()}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        console.log(`✅ Exportados ${selectedUserIds.size} usuarios`);
        alert(`✅ Exportación completada: ${selectedUserIds.size} usuarios`);
        
    } catch (error) {
        console.error('❌ Error exportando:', error);
        alert('Error al exportar usuarios. Verifica la consola.');
    }
}

// ============= PERSISTENCIA (localStorage) =============
function saveSelectionToStorage() {
    try {
        localStorage.setItem('ufv_selected_users', JSON.stringify(Array.from(selectedUserIds)));
    } catch (error) {
        console.warn('No se pudo guardar selección en localStorage:', error);
    }
}

function loadSelectionFromStorage() {
    try {
        const stored = localStorage.getItem('ufv_selected_users');
        if (stored) {
            const ids = JSON.parse(stored);
            selectedUserIds = new Set(ids);
            console.log(`📦 Cargados ${ids.length} usuarios seleccionados desde localStorage`);
        }
    } catch (error) {
        console.warn('No se pudo cargar selección desde localStorage:', error);
    }
}

// ============= UTILIDADES =============
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}