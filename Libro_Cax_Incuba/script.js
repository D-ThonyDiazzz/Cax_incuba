// ================================
// Configuración PDF.js
// ================================
pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// Ruta de tu PDF
const PDF_PATH = "assets/pdfs/LIBRO.pdf";

// ================================
// Configuración de páginas con VIDEO
// ================================
const videoPagesConfig = [
    // Ejemplo: Video en página 3
    { 
        page: 3, 
        src: "", // Si está vacío muestra el placeholder "Próximamente"
        title: "Video Introductorio - Cajamarca Incuba",
        replaceContent: true
    }
];

// ================================
// Estado Global
// ================================
let pdfDoc = null;
let totalPages = 0;
let pageNum = 1; // Siempre rastreamos la página IZQUIERDA actual (siempre impar)
let isAnimating = false; // Bloqueo para no romper la animación

// ================================
// Elementos del DOM
// ================================
const book = document.getElementById('book');
const flipper = document.getElementById('flipper');
const loader = document.getElementById('loader');

// Canvas (Donde se pinta el PDF)
const leftCanvas = document.getElementById('leftCanvas');
const rightCanvas = document.getElementById('rightCanvas');
const flipFrontCanvas = document.getElementById('flipFrontCanvas');
const flipBackCanvas = document.getElementById('flipBackCanvas');

// Capas de Video (Donde van los videos)
const leftVideoLayer = document.getElementById('leftVideoLayer');
const rightVideoLayer = document.getElementById('rightVideoLayer');
const flipFrontVideoLayer = document.getElementById('flipFrontVideoLayer');
const flipBackVideoLayer = document.getElementById('flipBackVideoLayer');

// Números de página
const leftNumEl = document.getElementById('leftPageNum');
const rightNumEl = document.getElementById('rightPageNum');
const flipFrontNumEl = document.getElementById('flipFrontNum');
const flipBackNumEl = document.getElementById('flipBackNum');

// Botones y Controles
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const pageIndicator = document.getElementById('pageIndicator');
const progressFill = document.getElementById('progressFill'); // Si tienes barra de progreso

// ================================
// 1. Lógica de Videos
// ================================
function getVideoConfigForPage(pNum) {
    return videoPagesConfig.find(v => v.page === pNum);
}

function setVideoOnLayer(layerEl, pNum, canvasEl) {
    // Limpiamos la capa
    layerEl.innerHTML = "";
    layerEl.className = "video-layer"; // Reset clases
    layerEl.classList.remove("active", "replace-mode");

    const config = getVideoConfigForPage(pNum);

    // Si no hay video para esta página, ocultar capa y mostrar canvas
    if (!config) {
        layerEl.style.display = "none";
        if (canvasEl) canvasEl.style.display = "block";
        return;
    }

    // Si hay video, configurar capa
    layerEl.style.display = "flex";
    layerEl.classList.add("active");

    // Lógica Replace vs Overlay
    if (config.replaceContent) {
        if (canvasEl) canvasEl.style.display = "none"; // Ocultar PDF
        layerEl.classList.add("replace-mode");
    } else {
        if (canvasEl) canvasEl.style.display = "block"; // Mostrar PDF fondo
    }

    // Badge (Etiqueta)
    const badge = document.createElement("div");
    badge.className = "video-badge";
    badge.innerHTML = '<i class="fas fa-video"></i> ' + (config.replaceContent ? 'VIDEO' : 'EXTRA');
    layerEl.appendChild(badge);

    // Contenido: Placeholder o Video Real
    if (!config.src) {
        // Placeholder
        const placeholder = document.createElement("div");
        placeholder.className = "video-placeholder";
        placeholder.innerHTML = `
            <div class="video-placeholder-icon"><i class="fas fa-play-circle"></i></div>
            <div class="video-placeholder-text">${config.title}</div>
            <div class="video-placeholder-subtitle">Próximamente disponible</div>
        `;
        layerEl.appendChild(placeholder);
    } else {
        // Video Iframe / Tag
        const vidContainer = document.createElement("div");
        vidContainer.className = "video-container";
        // Aquí podrías usar un <video> local o un iframe de YouTube
        vidContainer.innerHTML = `
            <div class="video-title"><i class="fas fa-play"></i> ${config.title}</div>
            <video controls src="${config.src}" style="width:100%; border-radius:8px;"></video>
        `;
        layerEl.appendChild(vidContainer);
    }
}

// ================================
// 2. Renderizado de PDF
// ================================
async function renderPage(pNum, canvas, videoLayer, numEl) {
    const ctx = canvas.getContext('2d');
    
    // Si la página está fuera de rango (ej: página 0 o mayor al total)
    if (pNum < 1 || pNum > totalPages) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (videoLayer) videoLayer.style.display = "none";
        if (numEl) numEl.innerText = "";
        return;
    }

    // Renderizar número de página
    if (numEl) numEl.innerText = pNum;

    // Renderizar Video (y decidir si ocultar canvas)
    if (videoLayer) setVideoOnLayer(videoLayer, pNum, canvas);

    // Si hay video full-screen, no gastamos recursos renderizando el PDF abajo
    const config = getVideoConfigForPage(pNum);
    if (config && config.replaceContent) return;

    // Renderizar PDF
    try {
        const page = await pdfDoc.getPage(pNum);
        
        // Calcular escala para alta calidad (Retina support)
        // Usamos un valor fijo de escala base o calculamos según contenedor
        const viewport = page.getViewport({ scale: 1.5 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };

        await page.render(renderContext).promise;
    } catch (e) {
        console.error("Error renderizando pág " + pNum, e);
    }
}

// ================================
// 3. Inicialización
// ================================
async function init() {
    try {
        const loadingTask = pdfjsLib.getDocument(PDF_PATH);
        pdfDoc = await loadingTask.promise;
        totalPages = pdfDoc.numPages;

        // Renderizar estado inicial (Páginas 1 y 2)
        await renderSpreadState(pageNum);

        // Ocultar loader
        setTimeout(() => {
            loader.classList.add('hidden');
        }, 500);

        updateControls();
        generateTOC(); // Generar índice
    } catch (error) {
        console.error("Error crítico:", error);
        alert("No se pudo cargar el PDF. Verifica la ruta en script.js");
        loader.style.display = 'none';
    }
}

// Función auxiliar para renderizar el estado estático actual
async function renderSpreadState(currentLeft) {
    // Izquierda estática
    await renderPage(currentLeft, leftCanvas, leftVideoLayer, leftNumEl);
    // Derecha estática
    await renderPage(currentLeft + 1, rightCanvas, rightVideoLayer, rightNumEl);
}

// ================================
// 4. Lógica de Animación (FLIP)
// ================================

// AVANZAR PÁGINA (Flip de Derecha a Izquierda)
async function flipNext() {
    // Validaciones: si ya anima o si no hay más páginas
    if (isAnimating || pageNum + 2 > totalPages + 1) return;
    isAnimating = true;

    // --- PASO 1: PREPARAR EL ESCENARIO ---
    // El "Flipper" es la hoja que se mueve.
    // Front = La página que estaba a la derecha (se levanta) -> Pág Actual + 1
    // Back  = La página que aparecerá a la izquierda (aterriza) -> Pág Actual + 2
    
    // Renderizamos el flipper
    await renderPage(pageNum + 1, flipFrontCanvas, flipFrontVideoLayer, flipFrontNumEl);
    await renderPage(pageNum + 2, flipBackCanvas, flipBackVideoLayer, flipBackNumEl);

    // Renderizamos qué hay DEBAJO a la derecha (la futura página derecha)
    // Es la página Actual + 3
    await renderPage(pageNum + 3, rightCanvas, rightVideoLayer, rightNumEl);

    // La izquierda estática se queda como está (Pág Actual) hasta que la hoja le caiga encima

    // --- PASO 2: ACTIVAR ANIMACIÓN CSS ---
    flipper.style.display = 'block';
    flipper.classList.add('animating'); // Activa display block
    
    // Forzar reflow para reiniciar animación si es necesario
    void flipper.offsetWidth; 
    
    flipper.classList.add('flip-next-anim');

    // --- PASO 3: FINALIZAR (Sincronizado con CSS 1.2s) ---
    setTimeout(async () => {
        // Actualizamos lógica
        pageNum += 2;
        
        // Ahora la página izquierda estática es la nueva (la que aterrizó)
        await renderPage(pageNum, leftCanvas, leftVideoLayer, leftNumEl);
        
        // Limpiamos animación
        flipper.classList.remove('animating', 'flip-next-anim');
        flipper.style.display = 'none';
        
        isAnimating = false;
        updateControls();
    }, 1200); // Mismo tiempo que --anim-speed en CSS
}

// RETROCEDER PÁGINA (Flip de Izquierda a Derecha)
async function flipPrev() {
    if (isAnimating || pageNum <= 1) return;
    isAnimating = true;

    const targetLeft = pageNum - 2; // A donde queremos llegar

    // --- PASO 1: PREPARAR EL ESCENARIO ---
    // En el modo 'prev', el flipper empieza "cerrado" a la izquierda (-180deg) y se abre a la derecha.
    
    // Back = La página que se levanta de la izquierda -> Pág Actual (pageNum)
    // Front = La página que aterriza en la derecha -> Pág Anterior Derecha (pageNum - 1)
    
    await renderPage(pageNum, flipBackCanvas, flipBackVideoLayer, flipBackNumEl);
    await renderPage(pageNum - 1, flipFrontCanvas, flipFrontVideoLayer, flipFrontNumEl);

    // Renderizamos qué hay DEBAJO a la izquierda (la futura página izquierda)
    await renderPage(targetLeft, leftCanvas, leftVideoLayer, leftNumEl);

    // La derecha estática se queda temporalmente con la página que será tapada

    // --- PASO 2: ACTIVAR ANIMACIÓN CSS ---
    flipper.style.display = 'block';
    flipper.classList.add('animating');
    void flipper.offsetWidth;
    flipper.classList.add('flip-prev-anim');

    // --- PASO 3: FINALIZAR ---
    setTimeout(async () => {
        pageNum -= 2;
        
        // Actualizamos la derecha estática (la que aterrizó)
        await renderPage(pageNum + 1, rightCanvas, rightVideoLayer, rightNumEl);
        
        flipper.classList.remove('animating', 'flip-prev-anim');
        flipper.style.display = 'none';
        
        isAnimating = false;
        updateControls();
    }, 1200);
}

// ================================
// 5. Controles y UI
// ================================
function updateControls() {
    // Texto indicador
    const lastPage = Math.min(pageNum + 1, totalPages);
    pageIndicator.innerHTML = `<i class="fas fa-book"></i> Páginas ${pageNum}-${lastPage} de ${totalPages}`;
    
    // Botones estado
    prevBtn.disabled = pageNum <= 1;
    nextBtn.disabled = pageNum + 1 >= totalPages;

    // Barra de progreso (si existe en tu HTML)
    if (progressFill) {
        const pct = ((pageNum + 1) / totalPages) * 100;
        progressFill.style.width = `${pct}%`;
    }
}

// Ir a página específica
async function goToPage(target) {
    if (isAnimating) return;
    
    target = parseInt(target);
    if (isNaN(target) || target < 1 || target > totalPages) {
        alert("Número de página inválido");
        return;
    }

    // Convertir a impar (lado izquierdo)
    if (target % 2 === 0) target--; 
    
    pageNum = target;
    loader.classList.remove('hidden'); // Mostrar loader brevemente
    await renderSpreadState(pageNum);
    loader.classList.add('hidden');
    updateControls();
}

// ================================
// 6. Event Listeners
// ================================
prevBtn.addEventListener('click', flipPrev);
nextBtn.addEventListener('click', flipNext);

// Teclado
document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') flipNext();
    if (e.key === 'ArrowLeft') flipPrev();
});

// Ir a página Input
const gotoInput = document.getElementById('gotoPageInput');
const gotoBtn = document.getElementById('gotoPageBtn');

if(gotoBtn) {
    gotoBtn.addEventListener('click', () => {
        goToPage(gotoInput.value);
    });
}
if(gotoInput) {
    gotoInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') goToPage(gotoInput.value);
    });
}

// Generar Índice Lateral
function generateTOC() {
    const toc = document.getElementById('tableOfContents');
    if (!toc) return;
    toc.innerHTML = "";
    
    // Creamos items cada 2 páginas
    for (let i = 1; i <= totalPages; i += 2) {
        const item = document.createElement('div');
        item.className = 'toc-item';
        item.innerHTML = `
            <span class="toc-title">Páginas ${i}-${Math.min(i+1, totalPages)}</span>
        `;
        item.onclick = () => {
            goToPage(i);
            // Cerrar sidebar si existe función
            const sidebar = document.getElementById('sidebar');
            if(sidebar) sidebar.classList.remove('active');
            const overlay = document.getElementById('sidebarOverlay');
            if(overlay) overlay.classList.remove('active');
        };
        toc.appendChild(item);
    }
}

// Sidebar Toggles (usando tu HTML original)
const toggleMenu = document.getElementById('toggleMenu');
const closeSidebarBtn = document.getElementById('closeSidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar = document.getElementById('sidebar');

function toggleSidebar() {
    sidebar.classList.toggle('active');
    sidebarOverlay.classList.toggle('active');
}

if(toggleMenu) toggleMenu.addEventListener('click', toggleSidebar);
if(closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
if(sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

// Resize handler
let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if(!isAnimating) renderSpreadState(pageNum);
    }, 300);
});

// Arrancar
init();