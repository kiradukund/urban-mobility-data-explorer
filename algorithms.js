// Algorith logic [I'm implementing the heap opearation by hand]
function isWeaker(a, b) {
    if (a.score !== b.score) {
        return a.score < b.score;
    }
    return a.item.id > b.item.id;
}
function sWapEntries(heap, i, j) {
    const temporary = heap[i];
    heap[i] = heap[j];
    heap[j] = temporary;
}
function heapifyUp(heap, index) {
    let current = index;
    while (current > 0) {
        const parent = Math.floor((current - 1) / 2);
        if (!isWeaker(heap[current], heap[parent])) {
            break;
        }
        sWapEntries(heap, current, parent);
        current = parent;
    }
}
function heapifyDown(heap, index) {
    let current = index;
    while (true) {
        const left = 2 * current + 1;
        const right = 2 * current + 2;
        let weakest = current;
        if (left < heap.length && isWeaker(heap[left], heap[weakest])) {
            weakest = left;
        }
        if (right < heap.length && isWeaker(heap[right], heap[weakest])) {
            weakest = right;
        }
        if (weakest === current) {
            break;
        }
        sWapEntries(heap, current, weakest);
        current = weakest;
    }
}
function heapPush(heap, entry) {
    heap.push(entry);
    heapifyUp(heap, heap.length - 1);
}
function heapReplaceRoot(heap, entry) {
    heap[0] = entry;
    heapifyDown(heap, 0);
}
function heapExtractMin(heap) {
    const weakest = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
        heap[0] = last;
        heapifyDown(heap, 0);
    }
    return weakest;
}


function topK(items, k, getScore) {
    const heap = [];
    let qualifying = 0;
    if (k <= 0) {
        return { entries: [], scanned: items.length, qualifying: 0, excluded: items.length };
    }
    for (const item of items) {
        const score = getScore(item);
        if (score === null) {
            continue;
        }
        qualifying += 1;
        const entry = { score: score, item: item };
        if (heap.length < k) {
            heapPush(heap, entry);
        } else if (isWeaker(heap[0], entry)) {
            heapReplaceRoot(heap, entry);
        }
    }
    const size = heap.length;
    const entries = new Array(size);
    for (let position = size - 1; position >= 0; position--) {
        entries[position] = heapExtractMin(heap);
    }
    return {
        entries: entries,
        scanned: items.length,
        qualifying: qualifying,
        excluded: items.length - qualifying
    };
}
