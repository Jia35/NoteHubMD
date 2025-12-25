/**
 * NoteHubMD Book Share Page Script
 */

const { createApp, ref, computed, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(true);
        const error = ref(null);
        const book = ref({});
        const notes = ref([]);
        const canEdit = ref(false);

        // Get shareId from URL
        const shareId = window.location.pathname.split('/').pop();

        const formatDate = (dateStr) => {
            if (!dateStr) return '-';
            return dayjs(dateStr).format('YYYY/MM/DD HH:mm');
        };

        const getNoteShareLink = (note) => {
            if (note.shareAlias) return `/s/${note.shareAlias}`;
            if (note.shareId) return `/s/${note.shareId}`;
            // If note doesn't have a share link, link to the note page
            return `/n/${note.id}`;
        };

        const loadBook = async () => {
            try {
                const res = await fetch(`/api/book-share/${shareId}`);
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to load book');
                }
                const data = await res.json();
                book.value = data;
                notes.value = data.Notes || [];
                canEdit.value = data.canEdit || false;

                // Update page title
                document.title = `${data.title || 'Book'} - NoteHubMD`;
            } catch (e) {
                error.value = e.message;
            } finally {
                loading.value = false;
            }
        };

        onMounted(() => {
            loadBook();
        });

        return {
            loading,
            error,
            book,
            notes,
            canEdit,
            formatDate,
            getNoteShareLink
        };
    }
}).mount('#app');
