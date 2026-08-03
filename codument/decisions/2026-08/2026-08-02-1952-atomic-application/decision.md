# Decision: atomic-application

Decision URI: decision://atomic-application
Source: archive://2026-08-02-1952-add-rich-document-semantic-materializer

Status: resolved
Durable candidate: yes
Evidence: 当前 normalizer 分别收集 insert/delete/move/content/table edits，且 text 只有字符串时不足以恢复 exact mark boundaries。
Confidence: 0.97
Reversibility: low
