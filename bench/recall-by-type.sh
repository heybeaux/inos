#!/bin/bash
# Recall-by-nodeType across 3-pass last-run
cd /tmp/inos/bench
for fid in 01-ai-conversation-log 02-research-notes 03-decision-journal 04-self-debate 05-messy-markdown; do
  ref="references/${fid}.json"
  echo "=== $fid ==="
  # Per-type totals in reference
  jq -r '.nodes[] | "\(.type)\t\(.id)"' "$ref" | sort > /tmp/inos/ref-types-$fid.tsv
  # For each pass, get missedNodeIds and their types
  for p in 0 1 2; do
    jq -r --arg fid "$fid" --argjson p $p '
      .results[] | select(.fixtureId==$fid) | .perPassMetrics[$p].missedNodeIds[]
    ' last-run.json > /tmp/inos/missed-$fid-p$p.txt
  done
done

# Now compute recall-by-type per fixture, summed over 3 passes
echo
echo "=== RECALL BY NODE TYPE (3-pass total) ==="
printf "%-30s %-15s %5s %5s %5s\n" "fixture" "type" "miss" "tot" "rec"
echo "----------------------------------------------------------"
for fid in 01-ai-conversation-log 02-research-notes 03-decision-journal 04-self-debate 05-messy-markdown; do
  ref="references/${fid}.json"
  # Get all types present
  types=$(jq -r '.nodes[].type' "$ref" | sort -u)
  for t in $types; do
    # Total refs of this type
    tot_per_pass=$(jq --arg t "$t" '[.nodes[] | select(.type==$t)] | length' "$ref")
    tot=$((tot_per_pass * 3))   # 3 passes
    # Misses: union of missed across 3 passes, joined to type
    miss=0
    for p in 0 1 2; do
      mp=$(while read id; do
             jq -r --arg id "$id" --arg t "$t" '.nodes[] | select(.id==$id and .type==$t) | .id' "$ref"
           done < /tmp/inos/missed-$fid-p$p.txt | wc -l | tr -d ' ')
      miss=$((miss + mp))
    done
    matched=$((tot - miss))
    rec=$(awk -v m=$matched -v t=$tot 'BEGIN{if(t==0){print "n/a"}else{printf "%.2f", m/t}}')
    printf "%-30s %-15s %5d %5d %5s\n" "$fid" "$t" "$miss" "$tot" "$rec"
  done
  echo
done
