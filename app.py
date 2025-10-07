"""
UFV User Manager - Flask Backend
Maneja visualización y filtrado de usuarios inactivos
"""

from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd
from pathlib import Path
import io
from datetime import datetime

app = Flask(__name__)

# ============= CONFIGURACIÓN =============
CSV_PATH = Path(__file__).parent / "data" / "usuarios_inactivos_ufv.csv"
PER_PAGE = 50

# ============= CARGA INICIAL DE DATOS =============
print("🔄 Cargando CSV...")
df_global = pd.read_csv(CSV_PATH, encoding='utf-8')
print(f"✅ CSV cargado: {len(df_global):,} usuarios")

# Extraer cursos únicos
def extract_all_courses():
    """Extrae todos los cursos únicos del CSV"""
    courses = set()
    
    for course_codes_str in df_global['course_codes']:
        if pd.notna(course_codes_str) and str(course_codes_str).strip():
            # Split por ", " (coma + espacio)
            for course in str(course_codes_str).split(", "):
                course = course.strip()
                if course:
                    courses.add(course)
    
    # Siempre incluir "Sin curso" al principio
    courses_list = ["Sin curso"] + sorted(list(courses))
    return courses_list

COURSES_LIST = extract_all_courses()
print(f"✅ Cursos únicos extraídos: {len(COURSES_LIST):,}")


# ============= RUTAS =============

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')


@app.route('/api/courses')
def get_courses():
    """Devuelve lista de todos los cursos únicos"""
    return jsonify({
        'courses': COURSES_LIST,
        'total': len(COURSES_LIST)
    })


@app.route('/api/users')
def get_users():
    """
    Devuelve usuarios paginados con filtros opcionales
    
    Query params:
    - page: número de página (default: 1)
    - per_page: usuarios por página (default: 50)
    - courses: cursos seleccionados separados por coma (opcional)
    """
    # Parámetros
    page = int(request.args.get('page', 1))
    per_page = int(request.args.get('per_page', PER_PAGE))
    courses_param = request.args.get('courses', '')
    
    # Filtrar por cursos si se especifican
    df_filtered = df_global.copy()
    
    if courses_param:
        selected_courses = [c.strip() for c in courses_param.split(',') if c.strip()]
        df_filtered = filter_by_courses(df_filtered, selected_courses)
    
    # Paginación
    total = len(df_filtered)
    total_pages = (total + per_page - 1) // per_page
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    
    # Obtener slice
    df_page = df_filtered.iloc[start_idx:end_idx]
    
    # Convertir a lista de diccionarios
    users = df_page.to_dict('records')
    
    # Formatear fechas para mejor visualización
    for user in users:
        # Mantener valores originales pero formatear para display
        user['created_at_display'] = format_date(user['created_at'])
        user['last_login_display'] = format_date(user['last_login'])
    
    return jsonify({
        'users': users,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': total_pages
        }
    })


@app.route('/api/backup', methods=['POST'])
def export_backup():
    """
    Genera CSV de usuarios seleccionados
    
    Body JSON: {"user_ids": [1067, 93486, 397]}
    """
    data = request.get_json()
    user_ids = data.get('user_ids', [])
    
    if not user_ids:
        return jsonify({'error': 'No users selected'}), 400
    
    # Filtrar DataFrame por IDs seleccionados
    df_selected = df_global[df_global['user_id'].isin(user_ids)].copy()
    
    # Crear CSV en memoria
    output = io.StringIO()
    df_selected.to_csv(output, index=False, encoding='utf-8')
    output.seek(0)
    
    # Crear respuesta
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    filename = f'backup_usuarios_ufv_{timestamp}.csv'
    
    return send_file(
        io.BytesIO(output.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=filename
    )


# ============= FUNCIONES AUXILIARES =============

def filter_by_courses(df, selected_courses):
    """
    Filtra usuarios por cursos seleccionados (lógica OR)
    
    Args:
        df: DataFrame completo
        selected_courses: Lista de course_codes seleccionados
        
    Returns:
        DataFrame filtrado
    """
    if not selected_courses:
        return df
    
    # Caso 1: Solo "Sin curso"
    if selected_courses == ["Sin curso"]:
        return df[df['num_courses'] == 0]
    
    # Caso 2: "Sin curso" + otros cursos
    if "Sin curso" in selected_courses:
        # Usuarios sin cursos
        mask_no_courses = (df['num_courses'] == 0)
        
        # Usuarios con al menos uno de los otros cursos
        other_courses = [c for c in selected_courses if c != "Sin curso"]
        mask_with_courses = df['course_codes'].apply(
            lambda x: has_any_course(x, other_courses)
        )
        
        return df[mask_no_courses | mask_with_courses]
    
    # Caso 3: Solo cursos específicos (sin "Sin curso")
    mask = df['course_codes'].apply(
        lambda x: has_any_course(x, selected_courses)
    )
    return df[mask]


def has_any_course(course_codes_str, target_courses):
    """
    Verifica si course_codes_str contiene al menos uno de los target_courses
    
    Args:
        course_codes_str: String con cursos separados por ", "
        target_courses: Lista de cursos a buscar
        
    Returns:
        True si contiene al menos uno
    """
    if pd.isna(course_codes_str) or not str(course_codes_str).strip():
        return False
    
    # Convertir a string y obtener lista de cursos
    courses_in_user = [c.strip() for c in str(course_codes_str).split(", ")]
    
    # Verificar si hay intersección
    return any(course in courses_in_user for course in target_courses)


def format_date(date_str):
    """
    Formatea fecha para visualización
    
    Args:
        date_str: Fecha en formato ISO o None
        
    Returns:
        Fecha formateada o "Nunca"
    """
    if pd.isna(date_str) or not str(date_str).strip():
        return "Nunca"
    
    try:
        # Parsear fecha ISO
        dt = pd.to_datetime(date_str)
        # Formatear: "15/09/2020 14:27"
        return dt.strftime('%d/%m/%Y %H:%M')
    except:
        return str(date_str)


# ============= INICIO DE LA APP =============

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🚀 UFV USER MANAGER - Servidor iniciado")
    print("="*60)
    print(f"📊 Usuarios cargados: {len(df_global):,}")
    print(f"📚 Cursos únicos: {len(COURSES_LIST):,}")
    print(f"🌐 Accede a: http://localhost:5000")
    print("="*60 + "\n")
    
    app.run(debug=True, host='0.0.0.0', port=5001)