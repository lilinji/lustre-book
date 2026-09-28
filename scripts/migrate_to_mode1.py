import os
import re
import shutil

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(ROOT_DIR, "_monolithic_backup")
SUMMARY_BAK = os.path.join(ROOT_DIR, "SUMMARY.md.bak")
SUMMARY_NEW = os.path.join(ROOT_DIR, "SUMMARY.md")

os.makedirs(BACKUP_DIR, exist_ok=True)

with open(SUMMARY_BAK, 'r', encoding='utf-8') as f:
    summary_lines = f.readlines()

new_summary_lines = []
ch_pattern = re.compile(r'^\*\s+\[(.*?)\]\((.*?)\)')

def promote_headings(text):
    out = []
    in_code = False
    for line in text.split('\n'):
        if line.startswith('```'):
            in_code = not in_code
            out.append(line)
        elif not in_code:
            if line.startswith('#### '):
                out.append('### ' + line[5:])
            elif line.startswith('### '):
                out.append('## ' + line[4:])
            else:
                out.append(line)
        else:
            out.append(line)
    return '\n'.join(out)

total_sections = 0
total_chapters = 0

# Mapping chapter number to subsystem keyword for disambiguation in checklists
CHAPTER_KEYWORDS = {
    1: "libcfs",
    2: "LNet",
    3: "Wire Protocol",
    4: "Portal RPC",
    5: "Recovery & AT",
    6: "LDLM 锁",
    7: "OBD 设备模型",
    8: "lu_object 对象栈",
    9: "FID 体系",
    10: "MDT 元数据",
    11: "DNE 水平扩展",
    12: "Changelogs",
    13: "Nodemap 租户安全",
    14: "OST/OSD 存储引擎",
    15: "条带化 PFL/FLR",
    16: "I/O 流水线与 Grant",
    17: "HSM 分层存储",
    18: "llite VFS 客户端",
    19: "cl_object 客户端对象",
    20: "分布式缓存一致性",
    21: "CTDB 集群接入网关",
    22: "MGS 动态配置",
    23: "HA 双机高可用",
    24: "磁盘配额治理",
    25: "快照与 Barrier",
    26: "监控与度量体系",
    27: "全栈性能调优",
    28: "容灾排查与自愈",
    29: "AI 前沿与 GDS",
}

for line in summary_lines:
    m = ch_pattern.match(line.strip())
    if not m:
        new_summary_lines.append(line)
        continue

    ch_title_in_summary, ch_rel_path = m.groups()
    ch_abs_path = os.path.join(BACKUP_DIR, ch_rel_path)
    if not os.path.exists(ch_abs_path):
        # Fallback to ROOT_DIR if first run
        ch_abs_path = os.path.join(ROOT_DIR, ch_rel_path)

    if not os.path.exists(ch_abs_path):
        print(f"WARNING: File {ch_abs_path} not found!")
        new_summary_lines.append(line)
        continue

    total_chapters += 1
    base_file = os.path.basename(ch_rel_path)
    ch_num_m = re.match(r'^(\d+)', base_file)
    ch_num = int(ch_num_m.group(1)) if ch_num_m else total_chapters
    kw = CHAPTER_KEYWORDS.get(ch_num, f"第{ch_num}章")

    ch_dir_rel = ch_rel_path[:-3] # strip .md
    ch_dir_abs = os.path.join(ROOT_DIR, ch_dir_rel)
    os.makedirs(ch_dir_abs, exist_ok=True)

    with open(ch_abs_path, 'r', encoding='utf-8') as cf:
        content = cf.read()

    # Split into preamble and sections
    parts = re.split(r'(?m)^##\s+', content)
    preamble = parts[0]
    raw_sections = parts[1:]

    sec_entries = []
    sub_idx = 1
    for sec_text in raw_sections:
        lines = sec_text.split('\n', 1)
        raw_heading = lines[0].strip()
        body = lines[1] if len(lines) > 1 else ""

        # Remove backticks from heading so file H1 and SUMMARY title match 100%
        clean_heading = re.sub(r'[`]+', '', raw_heading).strip()

        is_summary = ('小结' in clean_heading or '总结' in clean_heading)
        num_m = re.match(r'^(\d+)\.(\d+)\s*(.*)', clean_heading)

        if is_summary:
            sec_filename = "summary.md"
            sec_title = f"本章小结：{kw} 核心思考与自检"
            page_h1 = f"# {sec_title}"
        elif num_m:
            old_ch, sec_num, rest_title = num_m.groups()
            sec_num_str = f"{ch_num}.{sec_num}"
            sec_filename = f"{sec_num_str}.md"
            
            # Disambiguate duplicate titles like 运维基线检查清单 or 生产实战：参数调优...
            if "运维基线检查清单" in rest_title:
                rest_title = f"{kw} 运维基线检查清单"
            elif "参数调优与故障排查" in rest_title and kw not in rest_title:
                rest_title = f"生产实战：{kw} 参数调优与故障排查"
            elif "参数调优与监控指标" in rest_title and kw not in rest_title:
                rest_title = f"生产实战：{kw} 参数调优与监控指标"
            elif "生产调优与运行指标" in rest_title and kw not in rest_title:
                rest_title = f"生产实战：{kw} 生产调优与运行指标"

            sec_title = f"{sec_num_str} {rest_title}".strip()
            page_h1 = f"# {sec_title}"
            sub_idx = int(sec_num) + 1
        else:
            sec_num_str = f"{ch_num}.{sub_idx}"
            sec_filename = f"{sec_num_str}.md"
            rest_title = clean_heading
            if "运维基线检查清单" in rest_title:
                rest_title = f"{kw} 运维基线检查清单"
            sec_title = f"{sec_num_str} {rest_title}".strip()
            page_h1 = f"# {sec_title}"
            sub_idx += 1

        # Adjust image paths: ../images/ -> ../../images/
        body = re.sub(r'\]\(\.\./images/', '](../../images/', body)

        # Promote headings inside body (### -> ##, #### -> ###)
        promoted_body = promote_headings(body)
        sec_content = f"{page_h1}\n\n{promoted_body.lstrip()}"

        sec_abs_path = os.path.join(ch_dir_abs, sec_filename)
        with open(sec_abs_path, 'w', encoding='utf-8') as sf:
            sf.write(sec_content)

        sec_rel_path = f"{ch_dir_rel}/{sec_filename}"
        sec_entries.append((sec_title, sec_rel_path, sec_filename))
        total_sections += 1

    # Write README.md for the chapter
    readme_abs_path = os.path.join(ch_dir_abs, "README.md")
    clean_preamble = re.sub(r'\]\(\.\./images/', '](../../images/', preamble.strip())
    # Ensure preamble top H1 matches SUMMARY title exactly
    clean_preamble = re.sub(r'^#\s+.*', f"# {ch_title_in_summary}", clean_preamble)

    nav_links = "\n".join([f"- [{title}]({filename})" for title, _, filename in sec_entries])
    readme_content = f"{clean_preamble}\n\n## 本章核心小节导读\n\n{nav_links}\n"
    with open(readme_abs_path, 'w', encoding='utf-8') as rf:
        rf.write(readme_content)

    # Format chapter line and sub-sections in SUMMARY.md
    readme_rel_path = f"{ch_dir_rel}/README.md"
    new_summary_lines.append(f"* [{ch_title_in_summary}]({readme_rel_path})\n")
    for sec_title, sec_rel_path, _ in sec_entries:
        new_summary_lines.append(f"  * [{sec_title}]({sec_rel_path})\n")

with open(SUMMARY_NEW, 'w', encoding='utf-8') as f:
    f.writelines(new_summary_lines)

print(f"Migration completed successfully!")
print(f"Total chapters processed: {total_chapters}")
print(f"Total section files created: {total_sections}")
