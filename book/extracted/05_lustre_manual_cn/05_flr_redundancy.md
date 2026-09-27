# 05 文件级冗余 FLR 镜像机制 (第 22 章)

> 来源：官方 Lustre 中文操作手册 (Lustre Chinese Operations Manual)

Lustre MDS 变更日志，因此必须注册变更日志用户才能使用此命令工具。

### 21.3.1 使用1fs getsom显示 LSoM 数据

Ifs getsom命令列出了存储在 MDT上的文件属性。调用该命令需使用 Lustre 文
件系统上文件的完整路径和文件名。如果没有使用选项，则存储在 MIDS上的所有文件
属性都将显示出来。

### 21.3.2 Ifs getsom命令

1 1fs getsom ［-s］ ［-b］ ［-f］ <filename〉
下面列出了各种 Ifs getsom选项。
选项 说明
-S
-b
-f
仅显示给定文件的LSoM数据的大小值。这是一个可选标志
仅显示给定文件的LSoM 数据的块值。这是一个可选标志
仅显示给定文件的LSoM数据的标志值。这是一个可选标志。有效的标
志值有：SOM_FL_UNKNOWN =0x0000，表示未知或没有SoM数据，必须
从 OSTs 获取大小；SOM_FL_STRICT=0x0001，表示已知且严格正确，
FLR 文件（SOM 保证）；SOM_FL_DEISE=Ox0002，表示已知但已过时，即
在过去的某个时间点是正确的，但现在已知（或可能）不正确（例如，
打开进行写入）；SOM_FL_LAZY=0x0004，表示近似值，可能从未严格
正确过，需要同步 SOM 数据以实现最终的一致性。

## 第二十二章文件级冗余（FLR）


### 22.1.概述

Lustre 文件系统最初就是为 HPC 而设计的，它一直在具备内部冗余性和容错性的
高端存储上运行良好。然而，尽管这些存储系统的成本昂贵、结构复杂，存储故障仍然
时有发生。事实上，在Lustre 2.11 发布之前，Lustre 文件系统并不比其底层的单个存储
和服务器组件更可靠。Lustre 文件系统并没有机制能够缓解硬件存储故障。当服务器无
法访问或终止服务时，将无法访问文件。
Lustre 2.11 中引入了 Lustre 文件级冗余（FLR）功能，任何 Lustre 文件都可将相同
的数据存储在多台 OST上，以提升系统在存储故障或其它故障发生时的稳健性。在存


![图 25: 文件级冗余 FLR 镜像布局结构](images/manual_p258_xref1656.png)

*图 25: 文件级冗余 FLR 镜像布局结构*

在多个镜像的情况下，可选择最合适的镜像来响应单个请求，这对10可用性有直接影
响。此外，对于许多客户端同时读取的文件（如输入版，共享库或可执行文件），可以
通过创建文件数据的多个镜像来提高单个文件的并行聚合读取性能。
第一阶段的FLR 功能通过延迟写入实现（如"图21.1 FLR 延迟写入"所示）。在写入
镜像文件时，只有一个主镜像或首选镜像在写入过程中直接更新，而其他镜像将被标记
stale。 通过使用命令行工具（由用户或管理员直接运行或通过自动监控工具运行）
同步各镜像之间同步，该文件可在随后再次写入其它镜像。
Mirror 1
Objectj （primary, preferred）
Mirror 2
Object k （stale）
delayed resync
图 25:FLR delay writting
图21.1 FLR 延迟写入

### 22.2. 相关操作

Lustre 为用户提供了 1fs mirror 命令行工具来操作镜像目录或文件。

### 22.2.1.创建镜像文件或目录

命令：
1 lfs mirror create <--nirror-count|-N ［mirror_count］
2 ［setstripe_options| ［--flags=f1ags］］>•<filenameldirectory
上述命令将创建由 filename或 directory 指定的镜像文件或目录。
选项
说明
--mirror-count-N［mirror_count］ 用于指定使用setstripe_options所创建的镜像的
数量。它可以重复多次使用，以分离具有不同布局
的镜像。该参数是可选的，如果未指定，则默认为1；
如果指定，所指定的值必须紧挨着选项，不留空格。
setstripe_options
用于指定镜像的特定布局，可以是具有特定条带模式
的简单布局，也可以是复合布局，如渐进式文件布局
（PFL）。这些选项与1fs setstrip命令的选项相
同。如果未指定该选项，则将从前一个组件继承条带

选项
说明
--flags<=flags>
选项。如果这是第一个组件，则stripe_count和
stripe_size将继承文件系统范围的默认值，OST
pool_name将继承父目录设定值。
用于为创建的镜像设置标志，当前仅支持prefer标
志。prefer标志能够给Lustre 提示：哪些镜像将用于
为1/O提供服务。当读取镜像文件时，具有prefer
标志的组件可能会被选中，为该读操作提供服务；当
写入镜像文件时，MDT 也将倾向于选择具有prefer
标志的组件，并将与之重叠的其他组件标记为stale。
由于该标志只是为 Lustre 提供提示，这意味着 Lustre 仍
然可以选择没有此标志的镜像（例如，当1/O操作发生时
所有首选镜像都不可用）。该标志可以在多个组件上设
置。注意：设置该标志时，将对相应镜像的所有组件生
效。如果需要在创建镜像时为其单个组件设置标志，请
使用-comp-flags 选项。
注意：考虑到冗余和容错，用户需要确保不同的镜像必须位于不同的OSTs上，甚
至是不同的OSSs和机架上。实现这种架构，需要对集群拓扑的深刻理解。在最初的实
现中，使用现有的OST 池机制将允许通过任意的标准（即故障域）来分组OST。在实
际操作中，用户可以根据拓扑信息来对 OSTs分组，从而充分利用OST池。因此，在创
建镜像文件时，用户可以指出哪些 OST 池可以被镜像使用。
示例：
以下命令创建了有两个简单布局镜像的镜像文件。
1 client# lfs mirror create -N -S 4M -c 2 -p flash \
-N -c -1 -p archive /mnt/testfs/filel
显示镜像文件 /mnt/testfs/fi1e1的布局信息，请运行：
1 client# lfs getstripe /mnt/testfs/filel
2 /mnt/testfs/filel
1am_layout_gen：

！1
1cm_mirror_count: 2
1cm_entry_count: 2
lcme_id：
Icmne_mirror_id：
Icme_flags：
init
lcme_extent.e_start:0
1cme_extent.e_end：
EOF
Im_stripe_count：
Im_stripe_size：
Im_pattern：
raid0
Im_layout_gen：
Imm_stripe_offset: 1
Lmm_pool：
flash
Im_objects：
-0：｛1ost_idx:1,1_fid：［0x100010000:0x2:0x01 ｝
- 1：｛ 1ost_idx:0, 1_fid:T0x100000000: 0×2:0x0］ ｝
lcme id：
lcme_mirror_id：
lcme_flags：
lcme_extent.e_start:0
lcme_extent.e_end：
Im_stripe_count：
Im_stripe_size：
Imm pattern：
init
EOF
raidO
Im_layout_gen：
Im_stripe_offset: 3
Imm pool：
archive
Irn_objects：
- 0： ｛ 1ost_idx: 3, 1_fid： ［0x100030000:0x2:0x01 ｝
-1：｛1_ost_idx:4,1_fid：［0x100040000:0x2:0x01 ｝
-2： ｛ 1_ost_idx:5,1_fid：［0x100050000:0x2:0x0］｝
- 3：｛1ost_idx: 6,1_fid：［0x100060000:0x2:0x01 ｝
- 4：｛1_ost_idx: 7, 1
_fid：［0×100070000:0×2:0×01 ｝
-5：｛lost_idx: 2, 1
_fid：［0x100020000:0×2:0×01 ｝

第一个镜像有和两个条带在OST 池中的不同 OSTs上，条带大小为4MB。第二个
镜像从第一个镜像继承了4MB 的条带大小，在"archive"OST 池中的所有可用 OSTs上进
行条带化。
如上所述，建议在OST 池中配置独立故障域，并使用--Poo1|-P选项（1fs
setstripe选项之一）以确保不同的镜像放置在不同的OST、服务器或机架上，从而
提高可用性和性能。如果未指定setstripe选项，则可以在同一OST上创建带有对象
的镜像，但这将消除使用备份的大多数好处。
使用1fs getstripe输出的布局信息中，1cme_mirror_id为镜像 ID，它是镜
像的唯一数字标识符。1cme_flags为镜像组件标志。有效的标志名称有：

- init-表示镜像组件已完成初始化（即已经分配了 OST 对象）.

- stale-表示镜像组件没有最新的数据。陈旧的组件不会用于读取或写入操作，在
再次访问它们之前需要通过运行1fs mirror resync命令与最新数据进行同步。

- Prefer -表示镜像组件在读写时优先。例如，该镜像位于基于SSD的OST上，或
者在网络上与客户端距离更近（跳数更少）。该标志可由用户在创建镜像时设置。
以下命令创建了有3个 PFL 镜像的镜像文件：
1 client# lfs mirror create -N -E 4M -p flash --flags=prefer -E eof -c 2 \
2 -N -E 16M -S 8M -c 4 -P archive --comp-flags prefer -E eof -c -1 \
3 -N -E 32M -c 1 -p none
-E eof -c -1 /mnt/testfs/file2
以下命令镜像文件/mnt/testfs/file2 的布局信息：
1 client# lfs getstripe /mnt/testfs/file2
2 /mnt/testfs/file2
1cm_layout_gen：
1cm_mirror_count: 3
5 1cm_entry_count：
1cme_id：
Icne_mirror_id：
Icme_flags：
Icme_extent.e_start:0
Icme_extent.e_end：
Imm_stripe_count：
Im_stripe_size：
Lmm_pattern：
raid0
init,prefer
加
Im_layout_gen：
Im_stripe_offset: 1

8I
LC
SE
lmm_pool：
flash
Im_objects：
- 0: 11ost_idx:1, 1，
_fid：［Ox100010000:0×3:0×01 ｝
1cme_id：
1cne_mirror_id：
Icme_flags：
prefer
lcme_extent.e_start: 4194304
1cme_extent.e_end：
EOF
Im_stripe_count: 2
Im_stripe_size：
Im_pattern：
raid0
Im_layout_gen：
Im_stripe_offset：
Imm_pool：
flash
lame_id：
lcne_mirror_id：
Icme_flags：
raidO
archive
init,prefer
Icme_extent.e_start:0
lcme_extent.e_end：
Im_stripe_count：
Im_stripe_size：
Im_ pattern：
Imm_layout_gen：
Imm_stripe_offset: 4
Imm pool：
Inm_objects：
- 0：｛1_ost_idx: 4,1_fid： ［0x100040000:0x3:0x01｝
- 1：｛ 1ost_idx: 5, 1_fid： ［0x100050000:0×3:0x01 ｝
-2：｛1ost_idx: 6,1_fid：［0x100060000:0x3:0x01 ｝
- 3：｛ 1_ost_idx:7,1_fid：［0x100070000:0x3:0x0］ ｝
lcme_id：
Icmne_mirror_id：
lcme_flags：

Ss
lcmne_extent.e_start: 16777216
Icme_extent.e_end：
EOF
Lm_stripe_count：
lm_stripe_size：
Im_pattern：
raido
Im_layout_gen：
Im_stripe_offset： -1
Imn_pool：
archive
1cne_id：
Iane_mirror_id：
Icme_flags：
init
Icme_extent.e_start:0
Icme_extent.e_end：
Im_stripe_count: 1
Im_stripe_size：
Imm_pattern：
raidO
Im_layout_gen：
Im_stripe_offset:0
Imm_objects：
- 0： ｛1
_ost_id×： 0, 1.
_£id：［0×100000000:0×3:0×01｝
lcne_id：
Icne_mirror_id：
lcme_flags：
lcme_extent.e_start: 33554432
1cme_extent.e_end：
EOF
Imm_stripe_count：
lm_stripe_size：
lmm pattern：
raido
Imm_layout_gen：
Im_stripe_offset： -1
第一个镜像中，第一个组件继承文件系统的默认条带数和条带大小。第二个组件继
承第一个组件的条带大小和 OST 池，有两个条带。这两个组件都是从“flash" OST 池中
分配的。此外，Prefer标志应用于第一个镜像的所有组件，指示客户端在这些组件可

用时优先从他们读取数据。
第二个镜像中，第一个组件在"archive"OST 池中具有8MB 条带大小和4个条带。第
二个组件继承第一个组件的条带大小和 OST 池，并在"archive"OST池中的所有可用OST
上进行分条。prefer标志只应用于第一个组件。
第三个镜像中，第一个组件继承第二个镜像最后一个组件的8MB 条带大小，只有
一个单独的条带。OST 池名称被清除并从父目录继承（如果父目录设置了OST池名称）。
第二个组件继承第一个组件的条带大小，并在所有可用的OST上进行分条。

### 22.2.2. 扩展镜像文件

命令：
1 1fs mirror extend ［--no-verifyJ<--mirror-count|-N［mirror_count］
2 ［setstripe_optionsl-f <victim_filel> • <tilename）
上述命令将追加由 setstripe options 选项指定的镜像，或者将由filename指
定的文件的布局替换为现有文件victim_file的布局。该filename必须是现有文件，
但可以是镜像文件也可以是常规的非镜像文件。如果它是非镜像文件，则该命令会将其
转换为镜像文件。
选项
说明
-miror-count-N［mirror_count］ 用于指定使用setstrip_options所创建的镜像的
数量。它可以重复多次使用，以分离具有不同布局
的镜像。该参数是可选的，如果未指定，则默认为1；
如果指定，所指定的值必须紧挨着选项，不留空格。
setstripe_options
用于指定镜像的特定布局，可以是具有特定条带模式
的简单布局，也可以是复合布局，如渐进式文件布局
（PFL）。这些选项与1fs setstrip命令的选项相
同。如果未指定该选项，则将从前一个组件继承条带
选项。如果这是第一个组件，则stripe_count和
stripe_size将继承文件系统范围的默认值，
OST poo1_name将继承父目录设定值。
-f
如果该存在vicitim_file选项，该命令将从该文
件拆分布局并将其作镜像添加到镜像文件。命令

选项
--no-verify
说明
完成后，相应的victim_file将被删除。注意：
在命令行中，不能使用王<victim_file>选
项指定setstripe_options。
如果指定了victim_file，该命令将验证
victim_file中的文件内容与文件名是否相同。
否则，命令将返回失败信息。可以使用-no-verify
选项来覆盖此验证操作。如果文件很大，此选项可以
节省大量的文件内容比较时间，但只有在明确了文件
内容相同的情况下才使用此选项。
注意：1fs mirror extend选项不会应用到整个目录上。
示例：
布局镜像。
以下命令创建了一个非镜像文件，然后将其转化为镜像文件，并为其扩展一个简单
1 # 1fs setstripe -P flash /mnt/testfs/file1
2 # 1fs getstripe /mnt/testfs/filel
3 /mnt/testfs/filel
4 1mm_stripe_count: 1
5 lmm_stripe_size: 1048576
6 Im_pattern：
raido
7 Imm_layout_gen：
8 lm_stripe_offset: 0
9 Imm pool：
Elash
obdidx
objid
objid
0×4
group
13 # 1fs mirror extend -N -S 8M -c -1 -p archive /mnt/testfs/filel
14 # 1fs getstripe /mnt/testfs/filel
15 /mnt/testfs/filel
1cm_layout_gen：
1cm mirror_count：

18 1cm_entry_count: 2
LE
lcme_id：
Iane_mirror_id：
Lcme_flags：
init
lcme_extent.e_start:0
Icme_extent.e_end：
EOF
1m_stripe_count: 1
Im_stripe_size：
Im_pattern：
raidO
1m_layout_gen：
Imm_stripe_offset:0
1m_pool：
flash
Im_objects：
- 0：｛1_ost_idx:0,1_fid：［0x100000000:0×4:0×01 ｝
1cme_id：
lcne_mirror_id：
lcme_flags：
lcme_extent.e_start:0
lcme_extent.e_end：
Im_stripe_count：
Im_stripe_size：
Imm_pattern：
Im_layout_gen：
Im_stripe_offset: 3
1m_pool：
init
EOF
raido
archive
Im_objects：
- 0： ｛1_ost_idx: 3, 1_fid： ［0x100030000:0×3:0×01 ｝
- 1：｛1
-ost_idx: 4, 1_fid：［0x100040000:0×4:0×01 ｝
- 2： ｛1_ost_idx: 5, 1
fid：［0x100050000:0×4:0x01 ｝
- 3：｛1_ost_idx:6,1_fid：［Ox100060000:0×4:0×01 ｝
- 4：｛1_ost_idx:7,1_tid： ［0x100070000:0×4:0×01 ｝
- 5： ｛1
ost_idx:2,1_fid：［0x100020000:0×3:0x01 ｝
以下命令将从 victim_file中分离PFL 布局，并将其作为镜像文件添加到在之前
示例中创建的镜像文件 /mnt/testfs/file1 中（无数据验证）：

1S
1 # lfs setstripe -E 16M -c 2 -p none\
-E eof -c -1 /mnt/testfs/victim_file
3 # 1fs getstripe /mt/testfs/victim_file
4 /mnt/testfs/victim_file
1cm_layout_gen：
1am_mirror_count：
1cm_entry_count：
Icme_id：
Icne_mirror_id：
lcme
_flags：
init
lcme_extent.e_start:0
Icme_extent.e_end：
1m_stripe_count：
Im_stripe_size：
Imm pattern：
raido
Im_layout_gen：
Imm_stripe_ offset: 5
Im_objects：
-0：｛1ost_idx:5, 1
_fid：［0x100050000:0×5:0x01 ｝
- 1： ｛1_ost_idx: 6, 1_fid： ［Ox100060000:0×5:0×0］ ｝
lcme_id：
lcne_mirror_id：
lcme_flags：
1cme_extent.e_start: 16777216
lcme_extent.e_end：
EOF
Im_stripe_count：
Im_stripe_size：
Im_pattern：
raido
Im_layout_gen：
Imm_stripe_offset：
33 # 1fs mirror extend --no-verify -N -f /mnt/testfs/victim_file \
/mnt/testfs/file1
35 # lfs getstripe /mnt/testfs/filel
36 /mnt/testfs/filel

1cm_layout_gen：
lamn_mirror_count: 3
1an_entry_count：
Icme_id：
lane_mirror_id：
lcme_flags：
init
1cme_extent.e_start:0
Icme_extent.e_end：
EOF
Imm_stripe_count：
Im_stripe_size：
Im_pattern：
raido
Im_layout_gen：
lm_stripe_offset:0
Imm_pool：
flash
Lm_objects：
- 0:1 1ost_idx:0,1_fid:T0x100000000: 0x4:0x0］ ｝
lcme_id：
lcne_mirror_id：
Icme_flags：
init
lcme_extent.e_start:0
Icme_extent.e_end：
EOF
Im_stripe_count：
Im_stripe_size：
Im_pattern：
raido
Imm_layout_gen：
Im_stripe_offset: 3
Imm pool：
archive
Irn_objects：
- 0： ｛ 1ost_idx: 3, 1_fid： ［0x100030000:0x3:0x01 ｝
-1：｛1_ost_idx:4,1_fid：［0x100040000:0x4:0×01｝
-2： ｛ 1_ost_idx:5,1_fid：［0x100050000:0x4:0x0］｝
-3：｛1ost_idx: 6,1_fid：［0x100060000:0x4:0×01｝
- 4：｛1_ost_idx: 7,1.
_fid：［0x100070000:0×4:0x01 ｝
- 5：｛1ost_idx: 2,1
_fid：［0x100020000:0x3:0x01 ｝

L8
E6
1cme_1d：
1cne_mirror_id：
Icme_flags：
Icme_extent.e_start:0
lcme_extent.e_end：
1m_stripe_count：
Im_stripe_size：
Imn_pattern：
Im_layout_gen：
init
raid0
Imm_stripe_offset: 5
Lrm_objects：
- 0：｛ 1ost_idx: 5,1_fid:T0×100050000: 0×5:0×01 ｝
- 1：｛ 1ost_idx:6,1_fid:T0x100060000: 0×5:0x0］ ｝
lcme_1d：
lcme_mirror_id：
lcme flags：
1cme_extent.e_start: 16777216
Icme_extent.e_end：
EOE
1mm_stripe_count：
Im_stripe_size：
Imm_pattern：
raid0
Imm_layout_gen：
Im_stripe_ offset：-1
镜像扩展完成后，victim_file被移除：
1 # 1s /mnt/testfs/victim_ file
2 1s: cannot access /mnt/testfs/victim_file: No such file or directory

### 22.2.3. 拆分镜像文件

命令：
1 1fs mirror split <--mirror-id <nirror_id>
2 ［--destroyl-d］ ［-f <new_Eile］ <nirrored_file
上述命令将从mirrored
Lfile指定的现有镜像文件中拆分出
<mirrOr_id>指定ID 的镜像。默认情况下，将使用该分离镜像的布

局创建名力<mirrored
_file>.
mirror<mirror_id>的新文件。如果指定
T--destroy|-d选项，则该分离镜像将被销毁。如果指定了-f ＜new_file>选项，
则将使用该分离镜像的布局创建一个名为new_fi1e的文件。如果mirrored_f11e在
被拆分后只有一个镜像，它将转为常规的非镜像文件。如果原 mirrored_fi1e不是镜
像文件，则命令将返回错误。
选项
说明
--mirror-id
镜像的唯一标识符，即该ID 在镜像文件中是唯一的。将在镜像文件创建
或扩展时进行自动分配。可通过 lfs getstripe 命令返回。
--destroyl-d 用于销毁分离镜像。
-f
使用分离镜像的布局创建一个文件名次 new_Eile 的新文件。
示例：
以下命令将创建有四个镜像的镜像文件，然后从镜像文件中分离三个镜像。
创建有四个镜像的镜像文件：
1 # Lfs mirror create -N2 -E AM -P flash -E eof -c -1\
-N2 -S 8M -C 2 -p archive /mnt/testfs/filel
3 # lfs getstripe /mt/testfs/filel
4 /mnt/testfs/filel
lcm_layout_gen：
1cmn_mirror_count：
1cm_entry_count：
Iame_id：
lcne_mirror_id：
Icme_flags：
init
Icme_extent.e_start:0
Icme_extent.e_end：
Im_stripe_count：
lm_stripe_size：
Lm_ pattern：
raid0
Imm_layout_gen：
Im_stripe_offset: 1
Imm_pool：
flash
Im_objects：

6E
8b
IS
SS
- 0：｛1ost_idx:1,1_tid：［Ox100010000:0x4:0x0］ ）
lcme_id：
Icme_mirror_id：
lcme_flags：
lcme_extent.e_start: 4194304
lcme_extent.e_end：
EOF
Im_stripe_count：
Im_stripe_size：
Im_pattern：
raid0
Im_layout_gen：
Imm_stripe_offset：-1
Im_pool：
flash
Iame_id：
lcne_mirror_id：
Icme_flags：
Icme_extent.e_start:0
lcme_extent.e_end：
Im_stripe_count：
Im_stripe_size：
Im_pattern：
init
raid0
Imm_layout_gen：
Im_stripe_offset:0
Im_pool：
flash
Im_objects：
- 0： ｛1ost_idx: 0, 1
_fid： ［0x100000000:0×5:0×01 ｝
lcme_id：
lcme_mirror_id：
lcme_flags：
Icme_extent.e_start: 4194304
Icme_extent.e_end：
EOF
Lm_stripe_count：
Im_stripe_size：
Im_pattern：
raido

6S
SL
S8
Lrm_layout_gen：
Lmm_stripe_offset： -1
Im_pool：
flash
1ane_id：
1cne_mirror_id：
Icme_flags：
init
Icme_extent.e_start:0
1cme_extent.e_end: EOF
Irm_stripe_count: 2
Lmm_stripe_size：
Lmm_pattern：
raid0
Im_layout_gen：
Im_stripe_offset: 4
Imm pool：
archive
Irn_objects：
- 0：｛1_ost_idx: 4, 1_fid：［0x100040000:0x5:0×01 ）
- 1:11ost_idx:5,1_fid:T0×100050000: 0×6:0×01 3
Icme_id：
lcme_mirror_id：
Icme_flags：
1cme_extent.e_start:0
Icme_extent.e_end：
1m_stripe_count：
Im_stripe_size：
Imm pattern：
init
EOF
raidO
Imm_layout_gen：
Im_stripe_offset: 7
1mm pool：
archive
Irm_objects：
- 0：｛ 1_ost_idx:7,1_fid：［0x100070000:0x5:0x01 ｝
- 1：｛1
ost_idx: 2, 1_fid：
［0x100020000:0x4:0x0］｝
从 /mnt/testfs/file1 中拆分出ID 为1的镜像，并使用该分离镜像的布局创
建文件 /mnt/testfs/filel.mirror~1：

=I
1 # lfs mirror split --mirror-id 1 /mnt/testfs/filel
2 # lfs getstripe /mnt/testfs/filel.mirror~1
3 /mnt/testfs/filel.mirror~1
1am_layout_gen：
1cm_mirror_count：
1amn_entry count：
1cme_id：
Icmne_mirror_id：
lcme_flags：
init
lcme_extent.e_start:0
lcme_extent.e_end：
1mm_stripe_count：
Im_stripe_size：
1mn_pattern：
raido
Imm_layout_gen：
1m_stripe_offset: 1
Imm_ pool：
flash
Im_objects：
-0：｛1ost_idx:1,1_fid：［0x100010000:0x4:0x01 ｝
1cme_id：
Icne_mirror_id：
lcme_flags：
Icme_extent.e_start: 4194304
lcme_extent.e_end：
EOF
Lmm_stripe_count: 2
Im_stripe_size：
Im_pattern：
raido
Im_layout_gen：
Im_stripe_offset：
1mm_pool：
flash
从 /mnt/testfs/Eile1 中拆分出ID 为2的镜像，并摧毁该分离镜像：
1 # lfs mirror split --nirror-id 2 -d /mnt/testfs/filel
2 # 1fs getstripe /mt/testfs/filel
3 /mnt/testfs/filel

9I
8I
SZ
LC
ZE
1cm_layout_gen：
1cm_mirror_count:2
1an_entry_count: 2
Iamne_id：
lane_mirror_id：
Icme_flags：
init
Icme_extent.e_start:0
Icme_extent.e_end：
EOF
Imm_stripe_count：
Im_stripe_size：
Im_pattern：
raido
Im_layout_gen：
Im_stripe_offset: 4
Imm_pool：
archive
Lrm_objects：
- 0：｛ 1ost_idx:4,1_fid：［Ox100040000:0×5:0x01 ）
- 1:11_ost_idx: 5, 1_fid： ［Ox100050000: 0×6:0×01 3
Icme_id：
Icne_mirror_id：
lcme_flags：
Icme_extent.e_start:0
lcme_extent.e_end：
Im_stripe_count：
Im_stripe_size：
Im_ pattern：
Imm_layout_gen：
init
EOF
raid0
Im_stripe_offset: 7
Imm pool：
archive
lmm_objects：
-0：｛1ost_idx: 7,1_fid：［0x100070000:0×5:0×01 ｝
-1：｛1_ost_idx：
2,1_fid：［0x100020000:0x4:0x01｝
从 /mnt/testfs/file1 中拆分出ID 为1的镜像，并使用该分离镜像的布局创
建文件 /mnt/testfs/file2：
1＃
lfs mirror split
--mirror-id 3 -f /mnt/testfs/file2\

/mnt/testfs/filel
3 # 1fs getstripe /mt/testfs/file2
4 /mnt/testfs/file2
1cm_layout_gen：
1amn_mirror_count：
lan_entrycount：
lcme_id：
Icmne_mirror_id：
lcme_flags：
init
Icme_extent.e_start:0
lcme_extent.e_end：
EOF
Im_stripe_count：
1mm_stripe_size：
lm pattern：
raido
Imm_layout_gen：
Im_stripe_offset: 4
8I
Imm_ pool：
archive
Im_objects：
-0：｛1ost_idx:4,1_fid：［0x100040000:0x5:0x01 ｝
- 1：｛ 1_ost_idx: 5,1_fid： ［0x100050000:0x6:0x0］｝
23 # lfs getstripe /mnt/testfs/filel
24 /mnt/testfs/filel
1am_layout_gen：
1cm_mirror_count：
lcm_entry_count：
lame_id：
Icne_mirror_id：
lcme_flags：
init
1cme_extent.e_start:0
1cme_extent.e_end：
EOF
Im_stripe_count：
Im_stripe_size：
Im_pattern：
raido
lm_layout_gen：
Im_stripe_offset: 7

Imm_ pool：
archive
Lm_objects：
- 0： ｛1
_ost_10x: 7，上.
-Eid: 10x100070000:0×5:0x01 ｝
- 1：｛1
-ost_idx:2, 1.
_fid：［0x100020000: 0x4:0×01 ｝
以上布局信息显示了ID为1，2,3的镜像已全部从镜像文件
/mnt/testfs/file1 中分离。

### 22.2.4. 重新同步待同步镜像文件

命令：
1 lfs mirror resync ［--only nirror_idl，•..］2］
2 <nirrored_file ［Snirrored_file2...］
上述命令将重新同步由mirrored_f11e指定的待同步镜像文件。它支持在一行命
令中指定多个镜像文件。
如果指定的镜像文件没有过时的镜像，那么该命令什么也不做。否则，它会将
数据从已同步到最新数据的镜像复制到旧镜像，并将所有成功完成复制的镜像标记
为SYNC。如果指定了--only <mirror_id，•［1>选项，那么命令将只重新同步
由mirror_id（s）指定的镜像，此选项不能指定多个镜像文件。
选项 说明
-only 由mirror_id指定的某个或某些镜像需要重新同步。mirror_id
是镜像的唯一标识符。多个mirror_id由逗号分隔。指定多个
镜像文件时，不能使用此选项。
注意：由于 FLR第一阶段的延迟写入操作，在完成镜像文件的数据写入后，用户需
要运行1fs mirror
resync命令来同步所有镜像。
示例：
以下命令创建了一个有三个镜像的镜像文件，然后写入了数据病重新同步了过时的
镜像。
创建有三个镜像的镜像文件：
1 # 1fs mirror create -N -E 4M -p flash -E eof \
-N2 -p archive /mnt/testfs/filel
3 # lfs getstripe /mnt/testfs/filel
4 /mnt/testfs/filel

1cm_layout_gen：
1cm_mirror_count: 3
1an_entrycount：
Iamne_id：
lane_mirror_id：
lcme_flags：
init
1cme_extent.e_start:0
lcme_extent.e_end: 4194304
Imm_stripe_count：
Im_stripe_size: 1048576
Im_pattern：
raido
Im_layout_gen：
Imm_stripe_offset: 1
Imm_ pool：
flash
Lrm_objects：
- 0:1 1ost_idx:1,1_fid:T0x100010000: 0×5:0x0］ ｝
lcme_id：
Icmne_mirror_id：
Icme_flags：
1cme_extent.e_start: 4194304
Icme_extent.e_end：
EOF
Lm_stripe_count：
Im_stripe_size：
Lmm pattern：
raido
Im_layout_gen：
Im_stripe_offset： -1
Imm_pool：
flash
1cme_id：
1cne_mirror_id：
Icme_flags：
1cme_extent.e_start:0
Icme_extent.e_end：
1m_stripe_count：
Im_stripe_size：
init
EOF

Lmm_pattern：
Im_layout_gen：
Im_stripe_ offset: 3
Imm_ pool：
raidO
archive
Lm_objects：
- 0:11ost_idx:3,1_fid:T0x100030000: 0×4:0×01 3
lcme_id：
lcme_mirror_id：
lcme_flags：
init
lcme_extent.e_start:0
Icme_extent.e_end：
EOF
Lm_stripe_count：
Im_stripe_size：
Imm pattern：
raidO
Im_layout_gen：
Imm_stripe_ offset: 4
1mm pool：
archive
Im_objects：
-0：｛1
_ost_1dx:4,1_fid：［0x100040000:0×6:0×01 ｝
在镜像文件 /mnt/testfs/file1 中写入数据：
1 # yes | dd of=/mnt/testfs/file1 bs=1M count=2
2 2+0 records in
3 2+0 records out
4 2097152 bytes （2.1 MB） copied, 0.0320613 s, 65.4 MB/s
6 # 1fs getstripe /mnt/testfs/filel
7 /mnt/testfs/filel
1cm_layout_gen：
1cm_mirror_count：
1cm_entry_count：
lcme_id：
Iane_mirror_id：
lcme_flags：
init
lcme_extent.e_start:0

Icme_extent.e_end：
lcme_id：
1cne_mirror_id：
Icmne_flags：
1cme_extent.e_start: 4194304
lcme_extent.e_end：
EOF
1cme_id：
Icmne_mirror_id：
Icme_flags：
1cme_extent.e_start:0
Icme_extent.e_end：

- ..•••
init,stale
EOF
Icme_id：
1cne_mirror_id：
lcme_flags：
lcme_extent.e_start:0
1cme_extent.e_end：
…•.…
init,stale
EOF
以上布局信息显示，数据被写入了ID 为1的镜像的第一个组件，ID为2和3的镜
像被标记 "stale"（过时的）。
重新同步镜像文件 /mnt/testfs/file1的ID 为2的过时镜像。
1 # 1fs mirror resync --only 2 /mnt/testfs/filel
2 # 1fs getstripe /mnt/testfs/filel
3 /mnt/testfs/filel
lcm layout_gen：
1cm_mirror_count：
1cm entry count：
1cme_id：
lcme mirror id：
lcme_flags：
init

Icme_extent.e_start:0
Icme_extent.e_ end: 4194304

- •.•.•
lame_id：
1cne_mirror_id：
Icme_flags：
lcme_extent.e_start: 4194304
1cme_extent.e_end: EOF
Icme_id：
lcne_mirror_id：
lcme_flags：
init
1cme_extent.e_start:0
Icme_extent.e_end：
EOE

- •••••
lcme_id：
1cne_mirror_id：
lcme_flags：
1cme_extent.e_start:0
1cme_extent.e_end：

- ••
init,stale
EOF
以上为同步化完成后的布局信息，ID 为2的镜像的“stale”标记被移除。
重新同步镜像文件 /mnt/testfs/file1的所有过时镜像。
1 # 1fs mirror resync /mnt/testfs/filel
2 # 1fs getstripe /mnt/testfs/filel
3 /mnt/testfs/filel
lcm layout_gen：
1cm_mirror_count：
1cm entry count：
1cme_id：
lcme mirror id：
lcme_flags：
init

Icme_extent.e_start:0
Icme_extent.e_ end: 4194304

- •.•.•
lame_id：
1cne_mirror_id：
lcme_flags：
lcme_extent.e_start: 4194304
1cme_extent.e_end: EOF
Icme_id：
lcne_mirror_id：
lcme_flags：
init
1cme_extent.e_start:0
Icme_extent.e_end：
EOF

- •••••
1cmne_id：
1cne_mirror_id：
lcme_flags：
1cme_extent.e_start:0
1cme_extent.e_end：

- ...•
init
EOF
以上为同步化完成后的布局信息，没有镜像被标记为"stale"。

### 22.2.5. 验证镜像文件

命令：
1 lfs mirror verify ［--only <nirror_idmirror_id2l....］>］
2 ［--verbosel-V］ <nirrored_file ［Snirrored_file2 •..］
上述命令将验证由mirrored_file指定的镜像文件的所有SYNC镜像（包含最新
数据）是否具有完全相同的数据。它支持在一行命令中指定多个镜像文件。
这是一个应定期运行的清理工具，以确保镜像文件没有损坏。当镜像文件损坏时，
该命令将不会修复文件。通常，管理员应该检查每个镜像中的文件内容并决定哪一个是
正确的，随后调用1fs mirror resync进行手动修复。

选项
-only
说明
用于指示需要验证的镜像。mirror_id
是镜像的唯一数字标识符。多个mirror_id
以逗号分隔。注意：至少需要两个mirror_id。
此选项不能指定多个镜像文件。
--verbosel-v 使用该选项时，将在数据不匹配时显示哪些地方出
现了差异。未使用该选项只会在数据不匹配时返回
错误。此选项可以重复多次，以输出更多信息。
注意：
带有“'stale"或"offline"标志的镜像组件将被略过，不会被验证。
示例：
以下命令用于验证镜像文件的每个镜像包含了完全一样的数据。
1 # 1fs mirror verify /mnt/testfs/filel
以下命令使用了-v 选项以显示具体哪些地方出现了数据不匹配的情况。
1 # Lfs mirror verify -vvv /mnt/testfs/file2
2 Chunks to be verified in /mnt/testfs/file2：
3 ［0,0x200000）
［1, 2, 3,4］
4［0x200000,0x400000）
［1,2,3,4］
5 ［0x400000，
Ox600000）
［1,2, 3,4］
6 ［0x600000,0x800000）
［1,2,3,4］
7 ［0x800000，
0xa00000）
［1, 2,3,4］
8［0xa00000,0x1000000）
［12,3,4］
9［0x1000000,Oxffffffffffffffff）
［1,2,3,4］
11 Verifying chunk ［0,0x200000） on mirror: 1234
12 CRC-32 checksum value for chunk［0,0x200000）：
13 Mirror 1：
0x207b02£1
14 Mirror 2：
15 Mirror 3：
0x207b02£1
0x207b02£1
16 Mirror 4：
0x207b02£1

18 Verifying chunk ［O,0x200000） on mirror: 1 2 3 4 PASS
20 Verifying chunk ［0x200000,0x400000） on mirror: 1 234
21 CRC-32 checksum value for chunk ［0x200000,0x400000）：
22 Mirror 1：
0x207b02f1
23 Mirror 2：
0x207b02f1
24 Mirror 3：
0x207b02£1
25 Mirror 4：
0x207b02£1
27 Verifying chunk［0x200000,0x400000） on mirror: 1 2 3 4 PASS
29 Verifying chunk［0x400000,0x600000） on mirror: 1234
30 CRC-32 checksum value for chunk［0x400000,0x600000）：
31 Mirror 1：
0x42571b66
32 Mirror 2：
0x42571b66
0x42571b66
33 Mirror 3：
34 Mirror 4：
Oxabdaf92
36 lfs mirror verify: chunk ［0x400000,Ox600000）has different
37 checksum value on mirror 1 and mirror 4.
38 Verifying chunk ［0x600000,0x800000） on mirror: 1234
39 CRC-32 checksum value for chunk ［0x600000,0x800000）：
40 Mirror 1：
0x1f8ad0d8
41 Mirror 2：
0x1f8ad0d8
42 Mirror 3：
0x1f8ad0d8
43 Mirror 4：
0x18975b£9
45 lfs mirror verify: chunk ［0x600000,0x800000）has different
46 checksum value on mirror 1 and mirror 4.
47 Verifying chunk ［0x800000,0xa00000） on mirror: 1234
48 CRC-32 checksum value for chunk［0x800000,0xa00000）：
49 Mirror 1：
0x69c17478
50 Mirror 2：
0x69c17478
51 Mirror 3：
0x69c17478
52 Mirror 4：
0x69c17478

54 Verifying chunk［0x800000,0xa00000） on mirror: 1 23 4 PASS
56 1fs mirror verify：'/mnt/testfs/file2' chunk ［0xa00000,0x1000000］
57 exceeds file size 0xa00000: skipped
以下命令使用--only 选项来指定需要验证的镜像。
1 # lfs mirror verify -v --only 1,4 /mnt/testfs/file2
2 CRC-32 checksum value for chunk ［0,0x200000）：
3 Mirror 1：
0x207b02£1
4 Mirror 4：
0x207b02£1
6 CRC-32 checksum value for chunk［0x200000,0x400000）：
7 Mirror 1：
0x207b02£1
8 Mirror 4：
0x207b02£1
10 CRC-32 checksum value for chunk［0x400000,0x600000）：
11 Mirror 1：
0x42571b66
12 Mirror 4：
Oxabdaf92
14 lfs mirror verify: chunk［0x400000,0x600000）has different
15 checksum value on mirror 1 and mirror 4.
16 CRC-32 checksum value for chunk［0x600000,0x800000）：
17 Mirror 1：
0x1f8ad0d8
18 Mirror 4：
0x18975b£9
20 lfs mirror verify: chunk［0x600000,0x800000）has different
21 checksum value on mirror 1 and mirror 4.
22 CRC-32 checksum value for chunk［0x800000,0xa00000）：
23 Mirror 1：
0x69c17478
24 Mirror 4：
0x69c17478
26 lfs mirror verify：'/mnt/testfs/file2' chunk［0xa00000, 0x1000000］
27 exceeds file size 0xa00000: skipped


### 22.2.6. 查找镜像文件

1fs find 命令用于列出含指定属性的文件和目录。下面为该镜像文件或目录指定
了两个属性参数：
1 1f3 find <di rectorylfilename ….>
［［！］ --mirror-count|-N ［+-］n］
［［！］ --mirror-state <［^］state］
选项
说明
--mirror-countl-N ［+-Jn
用于指示镜像数量。
--mirror-state ＜［^］state> 用于指示镜像文件的状态。只能指定一个状态。如果使用
^state，则仅输出不匹配状态的文件。
有效状态名称有：
rO，只读状态，表示所有镜像都包含了最新的数据。
wP，写入状态。SP，重新同步状态。
注意；
在选项之前指定！表示否定（即不符合该参数的文件）。在数值之前使用+意思为"
多于n”，而在数值之前使用-意思为”小于n”。如果两者均未使用，则表示在指定单位
（如果有的话）上"等于n"。
示例：
以下命令将递归地列出在/mnt/testfs目录下所有有两个镜像以上的镜像文件：
1 # Lfs find --mirror-count +2 --type f /mnt/testfs
以下命令将递归地列出在 /mnt/testfs目录下待同步的镜像文件：
1 # lfs find --mirror-state=^ro --type f /mnt/testfs

### 22.3. 互操作性

Lustre 2.11.0中，我们引入了 FLR 功能。
对于 Lustre 2.9或更老版本的客户端来说，由于它们不理解 PFL 布局，将无法访问
和打开在 Lustre 2.11 文件系统中创建的镜像文件。
以下例子显示了在 Lustre 2.9 客户端上访问和打开（在 Lustre 2.11 文件系统中创建
的）镜像文件返回的错误：

