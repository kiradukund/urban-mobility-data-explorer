## Documentation: Problem and idea: Top-k unusual trips

## the problem
the outlier section shows the K most anomalous trips (K=10) from all trips matching the current filters. The data set may be very large, so we want to avoid sorting the entire set.

# what Top-k is

Given n items and a number K, return K items with highest score, strongest first.

## why we don't have to sort Everything

sorting n items takes O(n log n) time. We just need K of them. scan once and keep the best K seen so far costs O(n log k) time and O(k) extra space.

### what is Min-Heap

We are storing a binary tree in an array in a min-heap. Every parent is less than or equal to its children, so the weakest item is always at index 0 (the root).

Example with K= 5 (ratings):

 
                  12
                  /   \
                 18    25 
                 /\
               30  40  

Array:[12,18,25,30,40]


### parent and child index

-left child of i= 2i + 1
-right child of i = 2i+2
-parent of i = floor((i-1)/2)

#heapify Up and Heapify Down

-heapify-up: as long as the item is less powerful than its parent, swap them.
-heapify-down: while a child is less than the item , swap with the weaker child.


#the heap size remains at K

if three are K items in the heap, then a new trip is only accepted if it is stronger than the root (the weakest o the K).it replaces the root. And heapify down restores the heap ordering.


## Plain english steps 

1. create an empty heap
2. compute the score for each trips. No score if the trip is blind(how algorithm handles missing score).
3. if the trip has less than K items add the trip to the heap
4. else compare the trip with the root. if stronger, replace root and sink it.
5. after the last trip, extract the items one by one from the heap, and fill the result list from the end, so the result is strongest first. 

## pseudocode
     topK(items, K, getScore)
        heap <- empty list
        for each item in items
              score <- getScore(item)
              if score is missing then skip this item
              entry <- (score, item)
              if size(heap) < K
                  push entry onto heap, heapify-up
              else if root is weaker than entry
                  replace root with entry, heapify-down
        result <- empty list of size(heap)
        for position from size(heap) - 1 down to 0
               result[position] <- extract the weakest entry from heap
        return result
## Worked example (K=3)
scores in order: 12, 40, 25, 18, 30, 7, (missing)
         12          ->[12]
         40          ->[12, 40]
         25          ->[12, 40, 25]
         18 beats 12 -> replace root, sink -> [18, 40, 25]
         30 beats 18 -> replace root, sink -> [25, 40, 30]
         7 does not beat 25 -> ignored
         missing -> skipped
Result, strongest first: 40, 30, 25
## Edge cases
-k is 0 or negative: return an empty result.
-Fewer than k qualifying items: return all of them.
-items with no score are skipped and counted as excluded.
-Equal scores: the item with the smaller id ranks higher, so the result is always the same.
## Complexity
-time: O(n log k). Each of the n items need the most one push or replace, and each costs at most the height of the heap, about log K.
-Extra space: O(k). the heap never holds more than K items.                                  
