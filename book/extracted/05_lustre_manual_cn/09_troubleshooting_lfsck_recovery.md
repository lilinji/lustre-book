# 09 故障排查、LFSCK 在线修复与灾难恢复 (第 35~39 章)

> 来源：官方 Lustre 中文操作手册 (Lustre Chinese Operations Manual)


- 让应用程序对文件执行4kB 的O_DIRECT大小1/O，并禁用输出文件上的锁定。这
可以避免部分页面10 提交，以及客户端之间的争用。

- 让应用程序写入连续的数据。

- 为OST 添加更多磁盘或使用SSD磁盘。这将极大地提高IOPS 速率。为减少开销
（日志，连接等）创建更大的OST，而不是很多较小的OST。

- 使用 RAID-1+0 OST 代替 RAID-5/6。小块数据写入磁盘存在 RAID 奇偶校验开销。

### 34.11.写入性能与读取性能

通常，Lustre 集群上写操作的性能要优于读取操作。在写入时，所有客户端都异步
发送写入 RPC。RPC按照到达的顺序分配和写入磁盘。在很多情况下，这将允许后端存
储高效地会聚合写入操作。
相反，客户端的读取可能会以不同的顺序出现，并且需要大量磁盘搜索。这将明显
地阻碍读取吞吐量。
目前，尽管客户端进行预读，OST 本身不进行预读。如果有很多客户端正在读取，
执行任何预读都将消耗大量内存（1000个客户端的单个 RPC（1MB）预读也会占用1
GB 的RAM）而导致无法进行。
对于使用socklnd（TCP，以太网）互连的文件系统，还会产生额外的CPU开销。如
果不从网络缓冲区复制数据，客户端将无法接收数据。而在写入案例中，客户端 CAN
无需额外的数据副本即可发送数据。这意味着比起写入操作，客户端在读取期间更有可
能受 CPU 限制。

## 第三十五章 Lustre 文件系统故障排除


### 35.1. Lustre 错误消息

Lustre 提供了多种资源用于帮助解决文件系统中的问题。本节主要介绍错误代码，
错误消息和日志。

### 35.1.1.错误代码

错误代码由Linux 操作系统生成，位于/usr/include/asm-generic/errno.h中。
Lustre 软件没有使用所有可用的Linux 错误代码。错误代码的确切含义取决于它的使用
位置。以下是 Lustre 文件系统用户可能遇到的错误摘要。
错误代码 错误名称
说明
-EPERM
-ENOENT
访问被拒绝。
请求文件或目录不存在

错误代码 错误名称
-EINTR
-EIO
-ENODEV
-EINVAL
-ENOSPC
-EROFS
-EIDRM
-ENOTCONN
-ETIMEDOUT
-EDQUOT
说明
操作被中断（通常被 ctrl+c 或终止进程中断）
操作失败，存在读/写错误。
该设备不可用。服务器关闭或故障。
参数含非法值。
文件系统空间不足或索引节点不足。使用1fs df 查询文件
系统空间情况，使用1fs df -i 查询索引节点使用情况。
文件系统是只读的，可能由检测到的错误引起。
UID/GID 和MDS上任何已知的 UID/GID 都不匹配。在
MDS上更新 etc/hosts 和 etc/group，添加遗失的用户或
组。
客户端没有连接到服务器。
操作超时。
操作因超过用户磁盘配额而被丢弃。

### 35.1.2. 查看错误消息

Lustre 软件代码在内核上运行，能够向应用程序显示一位数的错误代码，这些错误
代码指示特定的问题。在节点上，/var/1og/messages保存有含至少过去一天的所有
消息的日志。有关来自该节点的所有最新内核消息，请参阅内核控制台日志 （dmesg）。
错误消息在控制台日志中被初始化为"LustreError”，并提供以下简短说明：

- 问题是什么

- 哪个进程ID 出现了问题

- 正在与哪个服务器节点进行通讯，等等
Lustre 日志被放在了 /proc/sys/1net/debug_path中。
收集与问题相关的第一组消息以及在"LBUG”或"assertion failure" 错误之前的任何消
息。提到服务器节点（OST 或MDS）的消息特指与该服务器相关的错误；您必须从相
关的服务器控制台日志收集类似的消息。
另一个 Lustre 调试日志包含 Luster 软件短时间内执行操作的信息，而Lustre 软件依
赖于 Lustre 节点上的进程。使用以下命令提取每个节点上的调试日志：


```bash
1 $ lctl dk filename
```
注意
LBUG 通过冻结线程来捕获 panic 堆栈。需要进行系统重启来清除线程。

### 35.2. 报告 Lustre 文件系统 Bug

如果通过对Lustre 文件系统进行故障排除仍无法解决问题，可尝试其他解决途径：

- 在 lustre-discuss 邮件列表发布您的问题或在档案中搜索您的问题以获得更多信息。

- 向 Lustre 软件项目的Jira*bug 追踪和项目管理工具提交故障单。首次使用需要在
欢迎页面注册账号。
请按照以下步骤发起Jira 申诉：
1.避免重复提交故障单，请搜索现有故障单以解决问题。有关搜索提示，请参见
本章第2.1 节"在Jira Bug Tracker 中搜索重复故障单"。
2. 创建申诉，请点击右上角的+Create Issue。请为您想询问的每一个问题提交单独
的故障单。
3. 在显示的表格中，输入：

- Project -选择 Lustre 或Lustre Documentation 或其它合适的项目。

- Issue type - 选择 Bug。

- Summary - 输入问题的简短描述。使用有利于搜索类似问题的术语，例如，Lus-
treError 或 ASSERT/panic 通常是一个很好的总结。

- Affects version（s）-选择您的 Lustre 版本。

- Environment-输入您的内核及其版本。

- Description - 可见症状的详细描述，以及问题的产生方式（可能的话）。其他有用
的信息包括您期望的行为，以及为诊断该问题您已尝试的方式。

- Attachments - 上传如Lustre 调试日志、系统日志、控制台日志等。注意：在Jira
故障单中上传 Lustre 调试日志前请使用1ct1 df处理调试日志。
表单中的其他字段用于项目跟踪，与报告问题无关，可以维持默认状态。

### 35.2.1. 在Jira* Tracker 中搜索重复故障单

在提交故障单之前，请在Jira Bug Tracker 中查找与您问题有关的现有故障单。这样
可以避免重复工作，并可能立即得解决方案。

在Jira Bug Tracker 中进行搜索，请选择Issues 选项卡，然后单击New filter。可使
用提供的过滤器为您的搜索选择条件。搜索特定文本，请在 Contains text 字段中输入文
本，然后单击放大镜图标。
搜索诸如 ASSERTION 或LustreError 消息之类的文本时，您可以按照下面的示例进
行搜索，请从字符串中删除NIDS 和其他有关安装的特定文本。
原始错误消息：
"（filter_io_26.c:791:filter_commitrw_write （））ASSERTION （oti->
oti_transno <=obd->obd_last_committed）failed: oti_transno752
last_committed750"
优化后的搜索字符串：
1 filter_cormitrw_write ASSERTION oti_transno obd_last_cormitted failed：

### 35.3. Lustre 文件系统常见问题

本节主要介绍如何解决Lustre 文件系统的常见问题。

### 35.3.1. OST 对象缺失或损坏

如果 OSS找不到对象或找到损坏的对象，则会显示以下消息：
1 OST object missing or damaged （OST ””ostl, object 98148, error -2）
如果报告的错误是-2（-ENOENT或”没有这样的文件或目录“），则该对象丢失。这
可能是因为 MIDS 和OST 没有同步，或者是OST 对象被删除或已损坏。
如果您使用了e2fsck从磁盘故障中恢复文件系统，则这些不可恢复的对象可能已
经被删除了或者在原始OST 分区上被移至/1ost+found中。由于MDS上的文件仍然
引用着这些对象，尝试访问它们会产生此错误。
如果您从原始MDS 或OST 分区的备份进行了恢复，则恢复的分区很可能与集群的
其余部分不同步。无论您还原的是服务器的哪个分区，MDS上的文件都可能引用已不
再存在（或备份时不存在）的对象。访问这些文件也会产生此错误。
如果上述情况都不适用，那可能存在编程错误，从而导致了服务器不同步。请提交
Jira 故障单（参见本章第2节"报告 Lustre 文件系统错误"）。
如果报告的错误是其他任何内容（如-5，"I/0 error"），则可能表示存储故障。
如果无法从存储设备读取数据，则低级文件系统会返回此错误。
建议的操作
如果报告的错误是-2，则可以考虑在原始OST设备上的/1ost+found 中查找丢
失的对象。但是，很可能这个对象已经永远丢失，且引用对象的文件现已部分或完全丢
失。从备份中恢复此文件，或挽救所有您能找到的文件，再进行删除。
如果报告的错误是其他内容，则应立即检查此服务器是否存在存储问题。．


### 35.3.2. OSTs变为只读

如果块设备级别的 Lustre 文件系统无法访问 SCSI 设备，则ldiskfs会将该设
备重新安装为只读，以防止文件系统损坏。这是一种正常行为。受影响的节点上
的/proc/fs/1ustre/health_check 的状态显示为"hot healthy"。
确定造成"not healthy"状况的原因：

- 检查所有服务器的控制台是否有任何错误指示

- 检查所有服务器的系统日志是否存在 LustreBrrors 或LBUG

- 检查系统硬件和网络的健康状况。（磁盘是否按预期工作，网络是否丟包？）

- 考虑当时集群上发生了什么。这与特定用户工作负载或系统负载情况有关吗？该
情况是否可重现？它是否发生在特定的时间（day, week or month）？
要从此问题中恢复，您必须使用这些文件系统重新启动 Lustre 服务。没有其他方法
可以知道哪些磁盘1/O 造成了这个问题，以及缓存与磁盘是否存在内容不一致的情况。

### 35.3.3.识别丟失的 OST

如果丢失了某个 OST，您可能需要知道哪些文件受到了影响。文件系统通常在丢失
一个 OST 的情况下仍可操作。请从任何已挂载的客户端节点生成位于受影响的 OST上
的文件的列表。建议将丢失的OST标记为”不可用”，以防止客户端和 MIDS尝试联系它
而超时。
1. 生成设备列表并确定 OST 的设备编号，运行：

```bash
$ lctl d1
```
lct1 d1命令将列出设备名称和编号以及设备 UUID 和设备上的引用编号。
2. 停用OST（在MDS 的OSS 上）。运行：
s lct1 --device lustre_device_nunber deactivate
OST 设备编号或设备名称由1ct1 d1命令生成。
deactivate 命令可以防止客户端在指定的 OST上创建新的对象（尽管您仍可以
读取 OST）。
注意
如果 OST 稍后变为可用，则需要重新激活它，运行：

```bash
# lct1 --device lustre_device_number activate
```
3. 确定所有在丢失OST上条带化的文件，运行：

```bash
# lfs find -O ｛OST_UUID｝ /mountpoint
```
这会从受影响的文件系统返回一个简单的文件名列表。

4. 如有必要，您可以阅读条带化文件的有效部分，运行：

```bash
# dd if=filename of=new_：
```
filename bs=4k conv=sync,noerror
5. 您可以使用un1ink命令删除这些文件。

```bash
# unlinkImunlink filename ｛filename •..｝
```
注意
运行 unlink命令时，可能会返回一个“无法找到文件"错误，并将MDS上的文件
永久删除。
目前无法在文件系统不能挂载的情况下直接从 MIDS 中解析元数据。如果故障OST
没有启动，则挂载文件系统的其它方法是使用一个循环OST 或新格式化的OST将其替
换。在这种情况下，丢失的对象被创，且被读为零填充。

### 35.3.4.修复 OST上错误的LAST_ID

每个OST 都包含一个 LAST_ID 文件，该文件保存由MDS（预）创建的最后一个对
象。MDT包含一个 lov_objid文件，其中的值代表 MDS分配给文件的最后一个对象。
在正常操作期间，MDT 在OST 上会保留一些预先创建的（但未分配的）对象，而
LAST_ID 和lov _objid之间的关系应为LAST_ID>lov_objid。文件值中的差异都会导致
OST 下次连接到 MDS 时在 OST上创建对象。这些对象从未实际分配给文件，它们的长
度力0（空）。
但是，如果lov_objid>LAST_ID，表明 MDS 将这些对象分配给了 OST上不存在的
文件。相反，如果lov_objid 远远小于LAST
ID（至少2万个对象），则表明OST之前在
MDS 的请求下分配了对象（很可能包含数据），但它不知道这些对象的存在。
从 Lustre 2.5开始，如果lov_objid 和LAST_ID 文件不同步，则MDS与OSS将自
动使其重新同步。这可能会导致OST上的一些空间在下一次运行 LFSCK之前无法使
用，但可以避免挂载文件系统的问题。
从 Lustre 2.6开始，LFSCK 会根据OST 上存在的对象，自动修复 OST上的LAST_ID
文件，以防该文件被损坏。
在磁盘损坏 OST 的情况下（如由于磁盘上启用了写入缓存引起的故障，或OST 从
旧的备份或重新格式化后恢复），LAST_ID 值可能会变得不一致，并生成类似于以下内
容的消息：
"myth-OST0002:Too many FIDs to precreate, OsT replaced or
reformatted: LFSCK will clean up"
如果 OST上先前创建的对象的记录与 MDS上的先前分配的对象之间存在显着差异
（例如，MDS 已损坏或从备份中恢复，如果未校验则可能导致严重的数据丢失），则可能
导致类似情形。这将产生如下信息：

1 ''myth-OST0002: too large difference between
2 MDS IAST_ID［Ox1000200000000:0x100048:0x01（1048648）and
3 OST LAST_ID ［Ox1000200000000:0x2232123:0x0］（35856675），trust the OST"
在这种情况下，MDS 将修改lov_objid 的值以与OST 的值相匹配，从而避免删除
现有的可能包含数据的对象。MDT 上引用这些对象的文件不会丢失。任何未被引用的
OST 对象将在下次运行 LFSCK 布局检查时被添加到.1ustre/1ost+found目录中。

### 35.3.5.处理"Bind: Address already in use" 错误

在启动过程中，Lustre 软件可能会报告 bind：Address already in use 错误
并拒绝启动操作。这是由于在 Lustre 文件系统启动之前启动了 portmap 服务（通常是
NFS 锁定），并绑定到默认端口 988。您必须在客户端、OSS 和 MIDS 节点上的防火墙或
IP 表中为传入连接打开端口 988。LNet 将在可用的预留端口上为每个客户端一服务器对
创建三个传出连接（从1023、1022 和 1021 开始）。
不幸的是，您不能设置 sunprc 以避免使用端口 988。如果您收到此错误，请执行以
下操作：

- 再启动任何使用 sunrpe 的服务前启动 Lustre 文件系统。

- 为Lustre 文件系统使用988以外的端口。这可在LNet 模块中的
/etc/modprobe.d/lustre.conf 配置，如：
Options Inet accept_port-988

- 在使用 sunrpe 的服务之前，将 modprobe ptlpe 添加到您的系统启动脚本中。这会
使Lustre 文件系统绑定到端口 988，sunrpe 以选择不同的端口。
注意
您还可以使用sysct1命令缓解 NFS 客户端获取Lustre 服务端口。但这是一个解决
部分问题的变通办法，因为其他用户空间RPC 服务器仍然可以获取端口。

### 35.3.6. 处理错误"-28"

在写入或同步操作期间发生的 Linux 错误-28 （ENOSPC） 指示在OST上的现有文
件由于 OST 已满（或几乎已满）而无法覆盖写或更新。要验证是否属于这种情况，请
挂载该 OST 的客户端上输入：
' client$ Ifs df -h UUID bytes Used Available Use% Mounted on myth-MDT0000_UUID

### 12.9G


### 1.5G 10.6G 12% / myth［MIDT: 0］ myth-OSTO000_UUID 3.6T 3.IT 388.9G 89%


/ myth oST:0J myth-OsT0001_UUD 3.6T 3.6T 64.0K 100% / myth［OST: 1］ myth-
OST0002
-UUID 3.6T 3.IT 394.6G 89% / myth［OST: 2］ myth-OST0003 _UUID 5.4T 5.OT

### 267.8G 95% /myth OST:3］ myth-OST0004_UULD 5.4T 2.9T 2.2T 57%/myth［OST:4］

filesystem_summary: 21.6T 17.8T 3.2T 85% /myth'
解决这个问题，您可以扩展 OST 的磁盘空间，或使用1fs_migrate将文件迁移至
不那么拥挤的 OST 上。
（Lustre2.6 引入）在某些情况下，一些持有打开的文件的进程消耗了大量的空间
（例如：失控进程向已删除的打开的文件写入大量数据）。可以从MDS 中获取文件系统
中所有打开的文件句柄的列表列表：

```bash
1 mds# lctl get_param mdt. *.exports. *.open_files
```
2 mdt.myth-MDT0000.exports.192.168.20.159tcp.open_files=
3 ［0x200003ab4:0x435:0x0］
4 ［0x20001e863:0x1c1:0x0］
5 ［0x20001e863:0x1c2:0x0］
6：
7：
These file handles can be converted into pathnames on any client via the lfs
fid2path
command （as root）：
1 client# 1fs fid2path /myth［0x200003ab4:0x435:0x0］［0x20001e863:0x1c1:0x0］
［0x20001e863:0x1c2:0x0］
2 lfs fid2path: cannot find '［Ox200003ab4:0x435:0x0］'： No such file or
directory
3/myth/tmp/4M
4 /myth/tmp/1G
5：
6：
在某些情况下，如果文件已经从文件系统中删除，fid2path 会返回一个“文件没有
找到”的错误。你可以使用客户端的 NID（如上面的例子中的192.168.20.159@tcp）来确定
文件是在哪个节点上打开的，而Isof 则可以找到并杀死持有该文件的进程。
1 #lsof /myth
2 COMMAND
PID
USER
FD TYPE
DEVICE
NAME
3 logger 13806 mythtv Or REG
/myth/logs/job.1283929.log （deleted）
SIZE/OFF
NODE
35, 632494 1901048576384 144115440203858997

在创建新文件时发生的Linux 错误-28（ENOSPC）可能表示 MIDS 的 inode 资源已
耗尽，MDS 需要扩展。新创建的文件不会写入满的OST，而现有文件将继续存在最初
创建的OST 中。要查看MIDS上的 inode 信息，请输入：
1 lfs df -i
2 UUID
3 myth-MDTO000_UUID
4 myth-OST0000_UUID
5 myth-OST0001_UUID
6 myth-OST0002_UUID
7 myth-OST0003_UUID
8 myth-OST0004_UUID
Inodes
Iused
IFree IUse Mounted on
0 100% /myth ［MDT:0］
587397 89% /myth［OST:0］
91o /myth［OST:1］
89% /mythIOST:2］
958 /myth［OST:3］
1420832 578 /myth［OST:4］
10 filesystem_surmary：
0 100% /nyth
通常，Lustre 软件会将此错误报告给您的应用程序。如果应用程序正在从函数
调用中检查返回代码，它会将其解码为文本的错误消息（如No space left on
device）。这两个版本的错误信息都会出现在系统日志中。
你也可以使用 lct1 get_param 命令来监控任一客户端的 OSTs和 MDTS上的空
间和对象使用情况。
1 lct1 get_param ｛osc,mdc｝.*.｛kbytes, files） ｛free,avail,total｝
注意
您可以在/usr/include/asm/errno.h中找到其他数字错误代码以及简短的名
称和文本说明。

### 35.3.7. 触发 PID NNN 看门狗定时器

在某些情况下，服务器节点会触发看门狗定时器，这会导致进程堆栈转储到控制
台，Lustre 内核调试日志转储到/tmp（默认情况下）。触发看门狗定时器并不意味着线
程的OOPS错误，而是它完成给定操作将需要比预期更长的时间。
在某些情况下，可能会出现这种情况。例如，RAID 重建实际上减慢了 OST上的I/
0速度，它可能会触发看门狗定时器跳闸。但不久之后又有一条消息，表明有问题的线
程已经完成了处理（几秒钟后）。一般来说，这表示这只是一个暂时的问题。在其他情
况下，它可能会指示线程因软件错误（如锁反转）而卡住了。
1 Lustre: 0:0：（watchdog.c:122:1cw_cb （））
以上消息表明看门狗已 pid 933启动：
它在 100000ms 内关闭：

1 Lustre: 0:0：（1inux-debug.c:132 :portals_debug_dumpstack（））
显示进程的堆栈：
1 933 11_ost_25
D F896071A
0 933
932 （L-TLB）
2 E6d87c60 00000046 00000000 f896071a f8def7cc 00002710 00001822 2da48cae
3 0008cfla f6d7c220 f6d7c3d0 f6d86000 f3529648 f6d87cc4 f3529640 f8961d3d
4 00000010 E6d87c9c ca65al3c 00001fff 00000001 00000001 00000000 00000001
调用追踪：
1 filter_do_biot0x3dd/0xb90 ［obdfilter］
2 default_wake_function+0x0/0x20
3 filter_direct_1o+ 0x2tb/0x990 ［obdfilter］
4 filter_preprw_read+0x5c5/0xe00 ［obdfilter］
5 lustre_swab_niobuf_
_remote+ 0x0/0x30 Iptlrpc］
6 ost_brw_read+Ox18df/0x2400 ［ost］
7 ost_handlet0x14c2/0x42d0 ［ost］
8 ptlrpc_server_handle_request+Ox870/0x10b0 ［ptlrpc］
9 ptlrpc_main+Ox42e/0x7c0 ［ptlrpc］

### 35.3.8. 处理初始 Lustre 文件系统设置的超时

如果您遇到 Lustre 文件系统初始设置的超时或挂起，请查看服务器和客户端的名称
解析是否正常工作。某些版本配置/etc/hosts将本地计算机的名称（由hostname' 命
令指示）映射到本地主机（127.0.0.1）而不是正确的IP地址。
这可能会产生这个错误：
1 LustreError： （1dlm_handle_cancel（））received cancel for unknown lock cookie
2 Oxe74021a4b41b954e from nid Ox7f000001 （0:127.0.0.1）

### 35.3.9.处理"LustreError: xxx went back in time” 错误

MDS 或OSS每次为客户修改 MDT 或OST磁盘文件系统的状态时，都会为该操作
记录一个按目标增加的事务编号，并将其与该操作的回复一起返回给客户段。当服务器
将这些事务提交到磁盘时，最后提交的事务编号被定期地返回给客户端，并允许从内存
中丢弃未提交的操作，因为在服务器故障的情况下，未提交的操作不再需要恢复。
在某些情况下，在服务器重启或发生故障转移后，观察到类似以下的错误信息：
1 IiustreError: 3769:0：（import.c: 517:ptlrpc_connect_interpret（））
2 testfs-ost12
_UUID went back in time （transno 831 was previously conmitted，

3 server now Claims 791） ！
出现这种情况的原因是：

- 您正在使用在数据写入实际执行前就声称有数据写入的磁盘设备（如具有大缓存
的设备）。如果该磁盘设备的故障或断电导致缓存丢失，那么您认为已完成的约定
交易也将丢失。这非常严重，您应该在重新启动Lustre 文件系统之前对该存储运
行 e2fsck。

- 根据Lustre 软件的要求，用于故障切换的共享存储是缓存一致的。这确保了如果
一台服务器接管另一台服务器，它可以看到最新的准确数据副本。当服务器进行
故障切换时，如果共享存储未提供所有端口之间的缓存一致性，则Lustre 软件可
能会产生错误。
如果您知道错误的确切原因，则无需采取进一步行动。如果您不知道，请与您的磁
盘供应商进行深入探讨。
如果错误发生在故障转移期间，请检查您的磁盘缓存设置。如果错误发生在未进行
故障切换的重启后，请尝试如何能让磁盘写入成功，然后解决数据设备损坏问题或磁盘
错误。

### 35.3.10. Lustre错误：'Slow Start_Page_Write"

当操作花很长的时间分配一批内存页时，会出现slow start_page_write消息。
请先使用这些内存页接收网络通信，然后再用于写入磁盘。

### 35.3.11.多客户端O_APPEND写入的劣势

多客户端通过O_APPEND写入单个文件是可能的，但存在很多缺点，使它成为次优
解决方案。

- 每个客户端都需要对所有OST 进行EOF锁定。这是由于在检查所有OST之前，很
难知道哪个 OST保存了文件的结尾。所有的客户端都使用同一个O_APPEND，因
此存在很大的锁定开销。

- 第二个客户端在第一个客户端完成写入之前不能获取所有锁，客户端只能顺序写
入。

- 为避免死锁，它们以已知的一致顺序获取锁。对于条带化文件来说，客户端在获
取所有 OSTs的锁前无法知道哪个 OST持有文件的下一部分。

### 35.3.12. Lustre 文件系统启动时的减速

当 Lustre 文件系统启动时，它需要从磁盘读入数据。重启后运行的第一个 mdsrate，
MDS 需要等待所有OST 完成对象预创建，这将导致文件系统启动时的减速。

文件系统运行一段时间后，缓存中将包含更多的数据，从磁盘读取关键元数据引起
的可变性将大大地消除。文件系统现在从缓存中读取数据。

### 35.3.13. OST 上的日志信息"Out of Memory"

规划OSS 节点硬件时，请把Lustre 文件系统中多个组件的内存使用情况列入考虑。
如果内存不足，"out of memory"消息将被记录。
在正常操作期间，以下几种状况表明服务器节点内存不足：

- 内核"Out of memory"和/或"oom-ki1ler"消息

- Lustre"kmalloc of'mmm'（NNNN bytes） Eailed..."消息

- Lustre 或内核堆栈跟踪显示进程卡在"trY_to_free_pages”消息

### 35.3.14. 设置SCSI I/O 大小

某些 SCSI 驱动程序默认的最大1/0大小对于高性能的 Lustre 文件系统而言仍然过
小。我们已经调整了不少驱动程序，但您仍然可能会发现某些驱动程序使用 Lustre 文件
系统时性能不理想。由于默认值是硬编码的，您需要重新编译驱动程序来更改默认值。
另外，一些驱动程序的默认设置可能是错误的。
如果您察觉到I/O 性能较差，且Lustre 文件系统统计信息的分析表明
其1/O不是1 MB，请检查 /sys/block/device/queue/max_sectors_kb。如
果max_sectors_kb值小于 1024，请将其设置1024或更大，从而提高性能。如
果更改max_sectors_kb值没有改变 Lustre 1/O 大小，您可能需要检查 SCSI 驱动程序
代码。

## 第三十六章故障恢复


### 36.1. 在备份ldiskfs 文件系统上恢复错误或损坏

OSS,MDS 或MGS服务器崩溃时，无需在文件系统上运行 e2fsck,ldiskfsjouraling
会确保文件系统在系统崩溃时仍保持一致。客户端不直接访问ldiskfs 文件系统，因此客
户端崩溃与服务器文件系统一致性无关。
只有当有事件导致了 ldiskfs journaling 无法处理的问题时（如硬件设备故障或1/0
错误），才需要在设备上运行 e2fsck。如果 ldiskfs 内核代码检测到磁盘损坏，它会将文
件系统挂载为只读，以防止进一步损坏，但仍允许该设备的读取访问。这在服务器的系
统日志中显示为"-30" （EROFS）错误，例如：
1 Dec 29 14:11:32 mookie kernel: LDISKFS-fs error （device sdz）：
ldiskfs_1ookup: unlinked inode 5384166 in dir #145170469

3 Dec 29 14:11:32 mookie kernel: Remounting filesystem read-only
在这种情况下，通常只需要在损坏设备上运行 e2fsck，然后再重新启动设备。
在绝大多数情况下，Lustre 软件可以应对磁盘上或文件系统其他设备间发现的任何
不一致情况。
强烈建议在记录器（如脚本）下运行e2fsck来记录对文件系统所做的所有输出和
更改，以备稍后用于问题分析。
如果时间允许，请首先在非修复模式下运行e2fsck（-n选项）以评估文件系统损
害类型和程度。但这么做的缺点是，e2fsck在这种模式下不能恢复文件系统日志，因
此可能会出现看起来存在文件系统损坏但实际却没有的情况。
为了分清损坏是真实的还是由于未重播日志造成的假象，您可以使用类似于以下的
命令，直接在已关闭 Lustre 文件系统的节点上挂载和卸载ldiskfs文件系统：
1 mount -t ldiskfs /dev/ ｛ostdev｝/mnt/ost; umount /mnt/ost
这会引起日志的恢复。
e2fsck工具在修复文件系统损坏（比类似的文件系统恢复工具更好，这也是为什
么选择ldiskfs 的原因）方面表现良好。尽管如此，确定损害的类型非常重要。一旦知道
了损害的类型，1diskfs专家可以针对需要修复的问题代替e2fsck做出明智的决定。
1 root# ｛stop lustre services for this device, if running｝
2 root# script /tmp/e2fsck.sda
3 Script started, file is /tmp/e2fsck.sda
4 root# mount -t ldiskfs /dev/sda /mnt/ost
5 root# umount /mnt/ost
6 root# e2fsck -fn /dev/sda # don't fix file system, just check for
corruption
7：
9：
8 ［e2fsck output］
10 root# e2fsck -fp /dev/sda

```bash
# fix errors with prudent answers （usually yes）
```

### 36.2. 在Lustre 文件系统上恢复损坏

如果 ldiskfs MDT 或OST 损坏，您需要运行e2fsck来修复本地文件系统一致性，
然后使用LFSCK在文件系统上运行分布式检查，以解决 MDT 和 OST 之间或MDT 之间
的不一致问题。
1. 关闭 Lustre 文件系统。

2. 在有问题的单个 MDT/OST 上运行e2fsck -f修复任何本地文件系统的损坏。
我们建议在脚本下运行e2fsck，创建记录文件系统更改的日志以供日后使用。运
行e2fsck后，如有必要，调出文件系统以减少停机窗口。

### 36.2.1.处理孤立对象

孤立对象问题是最简单的问题。运行LFSCK 布局检查时，这些对象将链接到新文
件，并放入 Lustre 文件系统中的.lustre/lost+found/MDTxxxx（其中，MDTxxxx
是找到孤立对象的 MDT 的索引），再根据需要对其进行检查、保存或删除。
Lustre 2.7及以上版本中，LFSCK也负责识别和处理 MDT上的孤立对象。

### 36.3. 从不可用的 OST 中恢复

在Lustre 文件系统环境中会遇到一个问题：由于网络分区、OSS 节点崩溃等，OST
变得不可用。发生这种情况时，OST 的客户端将暂停并等待 OST 再次变为可用（在主
OSS 或故障切换节点 OSS）。当 OST 重新上线时，Lustre 文件系统将启动恢复以使客户
端重新连接到 OST。Lustre 服务器对于等待恢复并重连客户端设置了时间限制。
在恢复过程中，客户端按照他们原来的顺序重新连接并重播他们的请求。在收到已
将某交易写入稳定存储的确认之前，客户端会保留该交易，以便在需要时重播。定期向
日志输出进度消息，并说明有客户端如何实现重新连接以及多少客户端已完成重新连
接。如果恢复被中止，此日志将显示有多少客户端曾设法重新连接。当所有客户端都已
完成恢复，或恢复超时时，恢复期结束，OST恢复正常的请求处理。
即使某些客户端在恢复期间无法重播他们的请求，不会阻止恢复完成。您可能会
遇到在 OST 进行恢复时某些客户端无法参与恢复（如网络问题或客户端故障）的情况，
此时它们将被驱逐，他们的请求将无法重播。因此，对被驱逐的客户端进行任何操作都
将失败，包括正在进行的写入操作，从而导致缓存的写入操作丢失。文件系统在客户端
发生故障时将挂起，恢复也不能无限期地等待。很不幸这可能导致交易丢失，但这是正
常的结果。
注意
客户端恢复失败并不表示（或导致）文件系统损坏。MDT 和 OST 能够处理类似的
正常事件，不会导致服务器之间的任何不一致。
版本的恢复（VBR）功能使故障客户端能够被"略过"，以便剩余的客户端重放他们
的请求，从而使故障OST 更加成功地进行恢复。

### 36.4. 使用LFSCK 检查文件系统

LFSCK 是一种管理工具，用于检查和修复已挂载的 Lustre 文件系统的特殊属性。
在概念上，它与用于本地文件系统的离线修复工具类似，但在实现上，在Lustre 文件系

统挂载使用时，LFSCK 作为文件系统的一部分运行。这样，Lustre 特殊元数据的一致性
检查和修复可以在不停机的情况下进行，因此对正常操作的影响可以忽略不计。
LFSCK 能够验证并修复对象索引表（Object Index,OI），对象索引表用于从Lustre
文件标识符（FID）映射到 MDT 内部ldiskfs inode 编号。LFSCK 包含一种被称力OI 清
理（OI Scrub）的过程，它会遍历对象索引表，并在必要时进行修正。在对MDT 进行
文件级的备份恢复后，或者在对象索引表受损的情况下，都需要触发 OI Scrub。在OI
Scrub 之后，LFSCK 将在后续阶段进一步检查 Lustre 分布式文件系统状态。LFSCK 的
命名空间扫描功能可以验证和修复目录 FID-in-dirent 和 LinkEA之间的一致性。无论
Lustre 文件系统规模有多大，LFSCK 都可以上面运行。
在 Lustre 2.6 中，LFSCK 布局扫描能够验证并修复 MIDT-OST 文件布局的不一致
性。MDT 对象和 OST 对象之间的文件布局不一致包括悬挂引用、未引用的OST对象、
不匹配的引用和多重引用。
在 Lustre 2.7中的LFSCK布局扫描可以支持多个 MDT 之间的验证和不一致性修
复。
LFSCK 的控制和监视是通过LFSCK 和1ct1 get_param命令实现的。LFSCK 支
持三种类型的接口：switch 接口，status 接口和 adjustment 接口。

### 36.4.1. LFSCK switch 接口


### 36.4.1.1. 手动启动 LFSCK 36.4.1.1.1. 说明

LFSCK 可在 MDT 挂载后使用lct1 1fsck_start 命令启动。

### 36.4.1.1.2. 示例

1 Ict1 1fsck_start <-M | --device ［MDT,OST］_device\
［-A | --al1］\
［-c | --create_ostobj on | off］\
［-C | --create_mdtobj on | off］\
［-d | --delay_create_ostobj on I off］\
［-e | --error ｛continue | abort｝］\
［-h |--help］\
［-n | --dryrun on | off］ \
［-o | --orphan］\
［-r | --reset］\
［-s | --speed ops_per_sec_1imit］\
［-t | --type check_typel,check_type...］］\
［-w | --window_size size］

### 36.4.1.1.3. 选项


下表列出了1fsck_start 的各种选项。输入 1ct1 1fsck_start -h查看所有
可用选项的完整列表。
选项
-M| --device
-A| --al1
-c | --create_ostobj
-C I --create_mdtobj
-d | --delay_create_ostobj
-e | --error
-h| --help
-n | --dryrun
-0 | --orphan
-冖1
--reset
说明
启动LFSCK 的MDT或OST 目标。
在所有服务器上的所有目标上启动LFSCK。默
认情况下，布局和命名空间的一致性检查、修
复也同时启动。（Lustre 2.6中引入）
为悬挂LOV EA 创建丟失的OST 对象，值力off
（默认）或on。如果没有指定该值，那么默
认为保留悬挂的 LOV EA 而不创建丢失的 OST
对象。（Lustre 2.6中引入）
为悬挂名称条目创建丢失的MIDT 对象，值为
off（默认）或on。如果没有指定该值，那么
默认为保留悬挂名称条目而不创建丢失的 MDT
对象。（Lustre 2.7中引入）
延迟为悬挂LOVEA 创建丟失的OST 对象，先完
成孤立 OST 对象处理。值为 off（默认）或on。
（Lustre 2.9中引入）
错误处理，值为 continue（默认）或 abort，
用于指定修复失败时 LFSCK 是否停止运行。如
果没有指定该值，则使用保存值（从检查点恢
复）。LFSCK 运行时该选项不能更改。
帮助信息操作。
用于不做任何更改的测试，值为 off（默认）
或on。
针对布局 LFSCK 修复孤立的 OST对象。
（Lustre 2.6中引入）
为指定 MIDT 重置对象循环的起始点。默认情况

选项
-s | --speed
tI --type
-w |--window_size
说明
下，迭代器会从上一个检查点（如果可用的话，
检查点通常由 LFSCK 定期保存）恢复扫描。
设置 LFSCK 处理的速率上限（每秒的对象数）。
如果未指定，则使用保存值（从检查点恢复）
或默认值0（0即尽可能快地运行）。该速率
可通过 adjustment 接口在 LFSCK 运行时更改。
应执行的检查或修复的类型。新的LFSCK 框架
为各种不同系统的一致性检查和修复操作提供
单一的接口，包括：没有指定的选项一上次运
行且未完成的LFSCK 组件或与已知的造成某些
系统不一致的相对应组件将启动。只要触发
LFSCK,OI scrub 将自动运行，因此无需在此
情况下指定 O1_scrub。namespace一检查
并修复 FID-in-dirent 和 LinkEA 一致性
（Lustre 2.4中引入，Lustre 2.7中增强了
DNE 模式下的名称空间一致性验证）。
layout一检查和修复 MDT-OST 不一致性。
（Lustre 2.6中引入）。
异步请求通道的窗口大小。LFSCK 异步请求通
道的输入/输出可能具有完全不同的处理速度，
过多的请求也可能导致异常的内存/网络压
力。如果未指定，则窗口默认值为1024

### 36.4.1.2. 手动关闭 LFSCK 36.4.1.2.1.说明

在MDT 挂载后关闭 LFSCK，请使用 lct1

### 36.4.1.2.2. 示例

1 lct1 1fsck_stop <-M | --device ［MDT, OST］_device\
lfsck_stop 命令。

［-A | --al1］\
［-h | --help］

### 36.4.1.2.3. 选项

用选项的完整列表。
下表列出了1fsck_stop 的各种选项。输入 1ct1 1fsck_stop -h查看所有可
选项
说明
-M| --device
-A | --a11
-h I --help
需关闭LFSCK 的 MIDT 或OST 目标。
同时关闭所有服务器上所有目标的 LFSCK。
帮助信息操作。

### 36.4.2. 查看 LFSCK 全局状态


### 36.4.2.1.说明 通过 MIDS上的一条lct1 1fsck_query命令检查 LFSCK 全局状态。

1 lct1 1fsck_query <-M | --device MDT_device\
［-h|--help］\
［-t |--type 1fsck_typel, lfsck_type...11\
［-W | --wait］

### 36.4.2.3. 选项 下表列出了1fsck_query 的各种选项。输入 lct1 1fsck_query

-h查看所有可用选项的完整列表。
Option
-M | --device
-h| --help
-t|--type
-w | --wait
Description
要查询 LFSCK 状态的设备。
操作帮助信息。
应该被查询的 LFSCK 类型，包括：布局、命名空间。
如果 LFSCK 在扫描中，查询将等待。

### 36.4.3. LFSCK status接口


### 36.4.3.1. 通过 procfs查看 OI Scrub 的LFSCK 状态 36.4.3.1.1. 说明


对于每个 LFSCK 组件，都有一个专用的 procts接口来跟踪相应的LFSCK 组件
状态。对于 OI Scrub 来说是OSD 层 procfs接口，名为oi_scrub。可使用标准的Ict工
get_param命令来查看 OI Scrub 状态。

### 36.4.3.1.2.示例


```bash
lctl get_param -n osd-ldiskfs.FSNAME-［MDT_target|0ST_targetl.oi_scrub
```

### 36.4.3.1.3.输出

信息类型 详细内容
普通信息 名称：OI_scrub.
Ol scrub magic id: OI scrub 的唯一标识符。
OI 文件数量。
状态：init，scanning，completed，
failed，
stopped, paused或crashed。
标志：包括recreated（OI 文件被移除或重建），
inconsistent（从文件级备份恢复），auto（由非UI
机制触发），upgrade（Lustre 1.8 起引入，IGIF 格式）
参数：OI scrub 参数，如 failout。
上次完成至今的时间。
上次启动至今的时间。
上次检查点至今的时间。
上次启动位置：上一个 scrub 启动位置。
上次检查点位置。
上次失败位置：待修复的第一个对象的位置。
当前位置。
统计信息
Checked：已扫描对象总数。
Updated：已修复对象总数。
Failed：修复失败的对象总数。
No Scrub：已标记为LDISKFS_STATE_LUSTRE_NOSCRUB
和skipped对象的总数。
IGIE:IGIF扫描对象总数。

信息类型 详细内容
Prior Updated：并行 RPC触发的对象修复个数。
Success Count：目标上已完成的OL_scrub 运行总数。
Run Time: Scrub 运行时间。从指定 MDT 目标开始扫
描时间起，不包括检查点之间的暂停时间或失败时间。
Average Speed：由Checked 除以run_time计算所得。
Real-Time Speed：上一个检查点至今的速率
（O1_scrub 正在运行）。
Scanned:/1ost+found目录下已扫描的对象总数。
Repaired:/1ost+found目录下已修复的对象总数。
Failed:/1ost+found目录下扫描和修复失败的对象总数。

### 36.4.3.2. 通过 Procfs查看命名空间的 LFSCK 状态 36.4.3.2.1.说明

namespace 组件负责第4节"使用LFSCK 检查文件系统"中所描述的检查。此
组件的procfs接口位于 MDD 层中，名为1fsck_namespace。请按照下面的示例使
用1ct1 get_param查看该组件状态。
LFSCK 命名空间状态输出分为阶段1和阶段2。在阶段1中，每个在MDT上运行
的LFSCK 主引擎对本地设备进行线性扫描，以确保所有本地对象都完成了检查。但在
某些情况下，LFSCK 无法知道对象是否一致，或无法修复其不一致性。因此，阶段2将
检查有多个硬链接的对象、具有远程父项的对象以及在阶段1期间无法验证的其他对
象。

### 36.4.3.2.2. 示例

1 lct1 get_param -n mdd. FSNAME-MDT_target.lfsck_namespace

### 36.4.3.2.3. 输出

信息类型 详细内容
普通信息
名称：1fsck_namespace
LFSCK namespace magic.
LFSCK namespace 版本。
状态：init，scanning-phasel,scanning-phase2，

信息类型 详细内容
统计信息
completed, failed, stopped, paused, Partial，
co-failed, co-stopped或 co-paused。
标志：包括 scanned-once（第一个循环扫描已完成），
inconsistent（已发现一个或多个 FID-in-dirent 或 LinkEA 条目不
一致），upgrade（Lustre 1.8起，IGIF 格式）
参数：包括dryrun，al1」
-targets,failout，
broadcast,orphan,create_ostobj 和create_mdtobj。
上次完成至今的时间。
上次启动至今的时间。
上次检查点至今的时间。
上次启动位置：最近开始的扫描的启动位置。
上次检查点位置。
上次失败位置：待修复的第一个对象的位置。
当前位置。
Checked Phase1:scanning-phase1期间扫描对象总数。
Checked Phase2:scanning-phase2期间扫描对象总数。
Updated Phase1:scanning-phase1期间修复对象总数。
Updated Phase2:scanning-phase2期间修复对象总数。
Failed Phasel :scanning-phase1期间修复失败的对象总数。
Failed Phase2:scanning-phase2期间修复失败的对象总数。
directories：已扫描目录总数。
multiple_1inked_checked 已扫描的多链接对象总数。
dirent_repaired：已修复的 FID-in-dirent 条目总数。
1inkea_repaired：已修复的 linkEA 条目总数
unknown_inconsistency:scanning-phase2期间发现的未定义不
一致总数。

信息类型 详细内容
unmatched_pairs_repaired：已修复的不匹配对总数。
dangling_repaired：已修复/发现的悬挂名称条目总数。
multi_referenced_repaired：已修复/发现的多引用名称条目总数。
bad_file_type_repaired：已修复的错误文件类型的文件总数。
lost_dirent_repaired：重新添加的丢失名称条目总数。
striped
_dirs_scanned：已扫描的条带化目录（主服务）总数。
striped
_dirs_repaired：已修复的条带化目录（主服务）总数。
striped_dirs_failed：验证失败的条带化目录（主服务）总数。
striped_dirs_disabled：失效的条带化目录（主服务）总数。
striped_dirs_skipped：因丢失主服务 LMV EA 而略过碎片验证的
条带化目录（主服务）总数。
striped_shards_scanned：已扫描的条带化目录碎片（从服务）总数。
striped_shards_repaired：已修复的条带化目录碎片（从服务）总数。
striped_shards_failed：验证失败的条带化目录碎片（从服务）总数。
striped_shards_skipped：因 LFSCK 无法知晓从LMV EA 是否有效而略过
名称哈希验证的条带化目录碎片（从服务）总数。
name
_hash_repaired：条带化目录下已修复的名称哈希错误的名称条目
总数。
nlinks_repaired：已修复 nlink 的对象总数。
mu1_1inked_repaired已修复的多链接对象总数。
local_lost_found_scanned: /1ost+found目录下已扫描的对象总数。
local_lost_found_moved: /1ost+found目录下已移至可见目录的对象总数。
local_lost_found_skipped:/1ost+found目录下略过的对象总数。
local_lost_found_failed:/1ost+found目录下处理失败的对象总数。
Success Count： 目标上完成LFSCK运行总数。
Run Time Phasel :scanning-phase1期间 LFSCK 运行时间（去除检

信息类型 详细内容
查点间的暂停时间）。
Run rime Phase2: scanning-phase2期间 LFSCK 运行时间（去除检查
点间的暂停时间）。
Average Speed Phasel ：由 checked_phase1 除以run_time_phase1
计算所得。
Average Speed Phase2：由 checked_phase2除以run_time_phase2
计算所得。
Real-Time Speed Phasel：上一个检查点至今的速率（LFSCK 正运行
scanning-phase1阶段）。
Real-rime speed Phase2：上一个检查点至今的速率（LFSCK 正运行
scanning-phase1阶段）。

### 36.4.3.3. 通过 procfs查看布局的LFSCK 状态 36.4.3.3.1. 说明

layout 组件负责检查和修复 MDT-OST 不一致性。此组件的procfs接口位于
MDD 层（名次1fsck
_layout） 和OBD层（名为1fsck_layout）。请按照下面的示
例使用lct1 get_param查看该组件状态。
LFSCK 布局状态输出分为阶段1和阶段2。在阶段1中，每个在MIDT/OST上运行
的LFSCK 主引擎对本地设备进行线性扫描，以确保所有本地对象都完成了检查。在此
期间，未被任何 MDT 对象引用的OST 对象被记录在位图中。在阶段2中，位图中的
OST 对象被重新扫描以检查它们是否真的是孤立对象。

### 36.4.3.3.2. 用例

1 lct1 get_param -n mdd.
2 FSNAME-
3 MDT
_target.1fsck_layout
4 lct1 get_param -n obdfilter.
5 FSNAMF-
6 OST_target.lfsck_layout

### 36.4.3.3.3. 输出


信息
说明
普通信息 名称：1fsck_layout
LFSCK namespace magic.
LFSCK namespace 版本。
状态：init，scanning-phasel,scanning-phase2，
completed, failed, stopped, paused, partial，
co-failed, co-stopped或 co-paused.
标志：包括scanned-once（第一个循环扫描已完成），
inconsistent（已发现一个或多个 FID-in-dirent 或LinkEA条目不一致），
incomplete（某些 MDT或OST没有参与LFSCK，或未能完成 LFSCK），
crashed_lastid （OST 上的lastid 文件崩溃，必须重建）。
参数：包括dryrun，a11_targets， failout。
上次完成至今的时间。
上次启动至今的时间。
上次检查点至今的时间。
上次启动位置：最近开始的扫描的启动位置。
上次检查点位置。
上次失败位置：待修复的第一个对象的位置。
当前位置。
统计信息
success Count：目标上完成LFSCK 运行总数。
Repaired Dangling：在scanning-phase1期间修复的有悬挂引
用的 MDT 对象总数。
Repaired Unmatched Pairs： 在scanning-phase1期间修复的
MDT 和 OST 对象不匹配对总数。
Repaired Multiple Referenced： 在scanning-phase1期间修复
的有多个引用的 OST对象总数。
Repaired Orphan：在scanning-phase2期间修复的孤立 OST 对象总数。

信息
说明
Repaired Inconsistent： 在scanning-phase1期间修复的所有者
信息错误的OST 对象总数。
Repaired Others： 扫描期间修复的其他类型不一致的对象总数。
Skipped：被略过的对象总数。
Checked Phasel:scanning-phase1期间扫描对象总数。
Checked Phase2:scanning-phase2期间扫描对象总数。
Failed Phasel:scanning-phase1期间修复失败的对象总数。
Failed Phase2:scanning-phase2期间修复失败的对象总数。
Run Time Phasel：
scanning-phase1期间 LFSCK 运行时间（去
除检查点间的暂停时间）。
Run rime Phase2: scanning-phase2期间 LFSCK 运行时间（去除
检查点间的暂停时间）。
Average Speed Phasel：由 checked_phase1 除以
run_time_phase1计算所得。
Average Speed Phase2：由 checked_phase2除以
run_time_phase2计算所得。
Real-Time Speed Phase1：上一个检查点至今的速率（LFSCK 正运
行scanning-phase1阶段）。
Real-rime speed Phase2：上一个检查点至今的速率（LFSCK 正运
行scanning-phase1阶段）。

### 36.4.4. LFSCK adjustment 接口


### 36.4.4.1. 速率控制


### 36.4.4.1.1.说明

如下用例所示，使用lct1 set_param 命令更改 LFSCK 速率上限：

### 36.4.4.1.2. 用例

1 lct1 set_param mdd.$｛ESNAME｝-$｛MDT_target｝.1fsck_speed_1imit=
2 N

3 lct1 set_param obdfilter.$｛ESNAME）-$1OST_target｝.lfsck_speed_1init=
4 N

### 36.4.4.1.3. 值域

值
说明
无速率限制（以最大的速率运行）。
正整数 每秒扫描对象的最大值。

### 36.4.4.2. auto_scrub 36.4.4.2.1.说明

auto_scrub参数用于控制在 OI 查找期间检测到不一致时是否触发 OI scurb。可
按照下面的用例和值的说明进行设置。
如果挂载时检测到文件级备份，也可使用noscrub禁用 OI scrub。如果指定
了noscrub安装选项，则auto_scrub也会随之被禁用，即使检测到 OI 不一致也
不会触发 OI scrub。auto_scrub可在挂载后使用以下命令重新启用。挂载后手动后动
LFSCK 有助于更好地控制启动条件。

### 36.4.4.2.2. 用例

1 lct1 set_param osd_ldiskfs.S｛ESNAME｝-$｛MDT_target｝.auto_scrub-N
其中，N为整数，值域如下表所示。

### 36.4.4.2.3. 值域

值
说明
不自动启动 OI。
正整数 OI 查找期间检测到不一致则自动启动 OI Scrub。
注意
Lustre 2.5 及以上版本支持使用-P选项使set_param永久生效。

## 第三十七章Lustre 文件系统调试


### 37.1.诊断调试工具

各种诊断和分析工具都可用于调试Lustre 软件的问题。其中一些由Linux 发行版提
供，另一些则是由 Lustre 开发项目提供。


### 37.1.1. Lustre 调试工具

以下的内核调试的机制已被整合到 Lustre 软件中：

- Debug logs - Lustre 内部调试消息将被输出至循环调试缓冲区（错误消息通常输
出至系统日志或控制台）。Lustre 调试日志的条目由/proc/sys/1net/debug设
置的掩码控制。日志默认大小为每个CPU SMB。系统繁忙时可增加日志大小。当
缓冲区填满时，旧的信息将被丢弃。

- lct1 get_param debug- 该命令显示当前的调试掩码，用于分隔写入内核日
志的调试信息。

- lct1 debug_kernel file- 将 Lustre 内核调试日志以ASCII 文本的形式转储
至指定文件中，以便进一步调试和分析。

- lct1 set_param debug_mb=size- 该命令设置了Lustre 内核调试缓冲区的最
大大小，单位为MiB。

- Dcbug daemon 一该调试进程用于控制将调试信息连续记录到用户空间的日志文
件中。
Lustre 软件也提供了以下工具：

- lctl -此工具与debug_kernel选项一起使用，可手动转储Lustre 调试日志或处理已

```bash
被自动转储的调试日志。有关lctl 工具的更多信息，请参见本章第2.2节"使用lctl
```
工具查看调试消息”。

- Lustre 子系统声明- 内核中的恐慌式断言（LBUG）会导致 Lustre 文件系统将调试
日志转储到文件/tmp/lustre-log.*timestamp*中，以便重启后还能进行检
索。

- 1£S-此实用程序提供对Lustre 文件的布局以及其他与用户相关的信息的访问。
更多关于1fs的信息请参考第40.1 章节“Ifs"。

### 37.1.2.扩展调试工具

本节中介绍的工具一部分来自于 Linux 内核，一部分来自于外部网站。

### 37.1.2.1. 管理和开发工具 Standard Linux Distribution 中提供了一些常用调试工具：


- strace—该工具允许跟踪系统调用。

- /var/log/messages - syslogd将严重的致命错误输出至此日志。

- Crash dumps -在启用了 Crash dumps 的内核中，sysrqc生成 crash 转储信息，
Lustre software 在其上添加日志信息（日志的最后64KB）并输出至控制台。

- debugfs -交互式文件系统调试器。

以下日志记录和数据收集工具负责收集信息用于调试 Lustre 内核问题：

- kdump 一用于调试运行有 Red Hat Enterprise Linux 系统的 Linux 内核 crash 工
具。有关 kdump的更多信息，请参 Red Hat knowledge base 的相关文章 How to
troubleshoot kernel crashes, hangs, or reboots with kdump on Red Hat Enterprise Linux。
下载 kdump，可通过yum install kexec-tools安装 RPM包。

- netconsole 一在 UDP 启用内核级网络日志记录。系统需求（SysRq）允许用户通过
netconsole收集相关数据。

- wireshark -网络数据包检查工具。它允许调试各种 Lustre 节点之间发送的信息。
该工具建立在tcpdump之上，可以读取由它生成的数据包转储。wireshark 2.6.0
版本后包含一些分解LNet 和 Lustre 协议的插件。有关更多详细信息，另请参阅
Wireshark Website。

### 37.1.2.2. 开发工具 本节介绍的工具对于在开发环境中调试 Lustre 文件系统可能很有

用。
大众最感兴趣的可能是：

- leak_finder.p1- Lustre 软件提供的这个程序对于在代码中查找内存泄漏非常
有用。
虚拟机通常用于创建独立的开发和测试环境。一些常用的虚拟机有：

- VirtualBox Open Source Edition 一为所有主要平台提供企业级虚拟化功能，可
在VirtualBox免费获取。

- VMware Server 一可作为入门软件的虚拟化平台，可在 Download VMware Server免
费获取。

- Xen-具有类似于 VMware Server 和 Virtual Box 虚拟化功能的半虚拟化环境。不
同的是，Xen 允许使用经过修改的内核来提供接近本机的性能，因此也具备模拟
共享存储的能力。更多信息请查看xen.org。
更有多种调试器和分析工具可供使用，包括：

- kgdb - Linux 内核源代码级调试器kgdb可与 GNU Debugger gdb 一起用于调试
Linux 内核。更多有关kgdb 和gdb的使用介绍，请参阅《Red Hat Linux 4 Debugging
with GDB guide》 中的第六章 Chapter 6. Running Programs Under gdb。

- crash 一用于在系统发生恐慌、锁定或无响应时分析保存的故障转储数据（crash
dump）。有关使用 crash 分析 crash dump 的更多信息，请参阅：

- 作者关于如何使用 crash 的概述：白皮书 Red Hat Crash Utility


### 37.2. Lustre调试过程

以下过程对于调试 Lustre 文件系统的管理员或开发人员可能很有用。

### 37.2.1. 了解 Lustre 调试消息格式

Lustre 调试消息按发起子系统、消息类型和在源代码中所处位置来分类。有关子系
统和消息类型的列表，请参见本章第 2.1.1 节"Lustre 调试消息"。
注意
有关子系统和调试消息类型的最新列表，请参阅 Luster 软件树中的
1ibcfs/include/1ibcfs/1ibcfs_debug.h。
组成Lustre 调试消息的元素在稍后的第2.1.2 节"Lustre 调试消息的格式”中进行了
描述。

### 37.2.1.1. Lustre 调试消息 每个Lustre 调试消息都含有标签纪录了发起子系统、消息类

型和在源代码中所处的位置。使用的子系统和调试类型如下所示：

- 标准子系统
mdc, mds, osc, ost, obdclass, obdfilter, llite, ptlrpc, portals, Ind, ldlm, lov.

- 调试类型
类型
说明
trace
入口/出口标记
dlmtrace 锁定相关的信息
inode
super
malloc
cache
info
dentry
mmap
page
info
分配或释放内存的相关消息
缓存相关消息
普通消息
内核空间缓存处理
内存映射的I0 接口
页缓存和块数据传输
杂项信息

类型
说明
net
console
调试相关的 LNet 网络
输出到控制台的重大系统事件
warning
error
输出到控制台的重大但不致命的异常
输出到控制台的关键错误信息
neterror
重大 LNet 错误信息
emerg
输出到控制台的致命系统错误
config
配置和设置，默认启动
ha
故障切换及恢复相关消息，默认启动
hsm
分层空间管理
ioctl
IOCTL 相关信息，默认启动
layout
文件布局处理（PFL, FLR, DoM）
Ifsck
文件系统一致性检查，默认启动
other
其他调试信息
quota
空间统计和管理
reada
客户端读管理
rpctrace
远程请求/应答跟踪和调试
sec
安全性，Kerberos，共享密钥处理
snapshot 文件系统快照管理
vistrace 内核 VFS接口操作
．

### 37.2.1.2. Lustre 调试信息格式 Lustre 软件使用CDEBUG（）和CERROR（）宏

来打印调试/错误消息。例如，CDEBUG（）宏使用函数1ibcfs_debug_msg（）
（1ibcfs/1ibcfs/tracefile.c）。消息格式如下所示：
描述
参数
subsystem

描述
参数
debug mask
smp_processor_id
seconds.microseconds

### 1081880847.677302

stack size
pid
host pid （UML only） or zero 31070
（file:line #：function_nameO） （obd_mount.c:2089:lustre _fill_super（0）
debug message
kmalloced '*obj : 24 at a37557lc （tot 17447717）|

### 37.2.1.3. Lustre 调试消息缓冲区 Lustre 调试消息保存在缓冲区中，由debug_mb参数

（Ict1 get_param debug_mb）指定最大缓冲区大小（以MB为单位）。缓冲区是循
环的，也就是说达到所分配的缓冲区得限制时，旧的消息被覆盖。

### 37.2.2.使用Ictl 工具查看调试信息

1ct1工具允许根据子系统和消息类型对调试消息进行过滤，从而从内核调试日志
中提取对故障排除有用的信息。
你可以使用 1ct1工具来：

- 获取所有类型和子系统的列表：
lct1 > debug_list subsystems |types

- 过滤调试日志：

```bash
lctl > filter subsystem_name ldebug_type
```
注意
当1ct1过滤时，它会从显示的输出中删除不需要的行，但这并不影响内核内存中
调试日志的内容。因此，您可以使用不同的过滤级别多次输出日志，而不必担心丢失数
据。

- 显示属于特性类型或子系统的调试信息：
lct1 > show subsystem_nameldebug_type

debug_kerne1从内核日志中提取数据，对其进行适当的过滤，并根据指定的选项
显示或保存数据。
lct1 > debug_kernel ［output filename］
如果调试是在用户模式Linux（UML）上完成的，那么您可能希望把日志保存在主
机上以供日后使用。

- 如果您已将调试日志保存到磁盘（可能是从 crash 转储的），请在磁盘上过滤日志：

```bash
lctl > debug_file input_file loutput_filel
```
在调试会话期间，您可以向日志添加标记或中断：

```bash
lctl > mark［marker text］
```
标记文本默认为调试日志中的当前日期和时间（类似于以下示例）：
DEBUG MARKER: Tue Mar 5 16:06:44 EST 2002

- 彻底刷新内核调试缓冲区：

```bash
lctl > clear
```
注意
使用1ct1显示的调试消息也受内核调试掩码的限制。可添加过滤器。

### 37.2.2.1. 1ct1运行范例 以下是使用1ct1运行的范例：

1 bash-2.04# ./lct1
2 lct1 > debug_kernel /tmp/lustre.
-1ogs/1og_al1
3 Debug log: 324 1ines, 324 kept, 0 dropped.
4 lct1 > filter trace
5 Disabling output of type "trace"
6 1ct1 > debug_kernel /tmp/lustre.
-_logs/log_notrace
7 Debug log: 324 1ines, 282 kept, 42 dropped.
8 lct1 > show trace
9 Enabling output of type "trace"
10 lct1 > filter portals
11 Disabling output from subsystem "portals"
12 1ct1 > debug_kernel /tmp/lustre_1ogs/log_noportals
13 Debug log: 324 1ines, 258 kept, 66 dropped.

### 37.2.3. 将缓冲区内容转储到文件（debug_daemon）

lct1 debug_daemon命令用于将debug_kerne1缓冲区连续转储到用户指定的
文件。此功能使用内核线程来连续转储来自内核调试日志的消息，使比内核缓冲区大得

多的调试日志得以更长时间保存。
debug_daemon高度依赖于文件系统的写入速度。如果Lustre 文件系统负载过大
且debug_buffer持续写入调试消息，则文件系统写操作可能无法快到可以及时刷新
debug_buffer.
用户可以使用lct1 debug_daemon命令启动或停止转储debug_buffer到文件
的 Lustre 守护进程。

### 37.2.3.1.

Ict1 debug_daemon 命令初始化debug_daemon，开始将
debug_buffer 转储到文件，使用root用户运行：
1 lct1 debug_daemon start filename ［megabytes］
调试日志将从内核写入指定的文件名。该文件将被限制指定的兆字节内（可选）。
当输出文件大小超过用户指定文件大小的限制时，守护程序会将数据存在文件的开
头。要将转储的文件解码为 ASCII 并按时间对日志条目进行排序，请运行：
1 lct1 debug_file filename > newfile
输出由 1ct1命令进行内部排序：
停止debug_daemon 操作并刷新文件输出，运行：
1 1ct1 debug_daemon stop
否则，debug_daemon将作为 Lustre 文件系统关闭过程的一部分关闭。用户可以在
停止命令发出后使用 start命令重新启动debug_daemon。
下面是一个使用debug_daemon和1ct1的交互模式将调试日志转储到一个40MB
的文件的示例。
1 lct1
1 lct1 > debug_daemon start /var/log/lustre.40.bin 40
1 run filesystem operations to debug
1 lct1 > debug daemon stop
1 lct1 > debug_file /var/log/lustre.bin /var/log/lustre.log
要启动另一个不限制文件大小的守护进程，请运行：
1 lct1 > debug_daemon start /var/log/lustre.bin
文本消息 *** End of debug_daemon trace log *** 将会在每个输出文件
末尾显示。


### 37.2.4.写入内核调试日志的控制信息

lct1 set_param subsystem_debug=subsystem_mask
和 lct1
set_param debug=*debug_mask用于确定将哪些信息写入调试日志。
subsystem_debug掩码根据代码的功能区域（例如 Inet,osc 或ldm）确定写
入日志的信息。调试掩码根据消息类型（如 info，，error,trace 或 malloc）控制信息。使
用1ct1 debug_1ist types 命令查看调试掩码的完整列表。
完全关闭 Lustre 调试功能：
1 lct1 set_param debug=O
完全打开 Lustre 调试功能：
1 lct1 set_param debug=-1
列出所有可能的调试掩码：
1 lct1 debug_1ist types
记录与网络通信有关的消息：
1 lct1 set_param debug net
记录当前调试标志以及网络通信相关的消息：
1 lct1 set_param debug=+net
不再记录网络通信中变化的调试标志：
1 lct1 set_param debug=-net
内核调试日志写入的各种选项可在1ibcfs/include/1ibcfs/1ibcfs.h中找
到。

### 37.2.5. 使用 strace进行故障排除

Linux 发行版提供的实用程序 strace 可以通过拦截进程所做的所有系统调用并记
录系统调用名称、参数和返回值来跟踪系统调用。
在程序中调用 strace，请输入：
1 $ strace program ［arguments］
有时，系统调用可能会分叉成子进程。在这种情况下，可使用strace的-f选项来
跟踪子进程：
1 $ strace -f program ［arguments］
将strace输出重定向到文件，请输入：

1 $ strace -o filename program ［arguments］
使用-f壬选项和-o将跟踪输出保存在filename.pid中，其中pid是被跟踪进程的
进程ID。使用-ttt选项为strace输出中的所有行加上时间戳，以便它们可以与 Luster
内核调试日志中的操作相关联。

### 37.2.6. 看磁盘内容

在Lustre 文件系统中，元数据服务器上的 inode 包含存储有文件条带信息的扩展属
性（EA）。EA 包含所有对象ID 及其位置（即存储它们的OST）的列表。可以使用1fS工
具通过getstripe子命令获取给定文件的相关信息。使用相应的1fs setstripe命令
为新文件或目录指定条带属性。
1fs getstripe命令将Lustre 文件名作为输入，并列出构成此文件一部分的所有
对象。要获取 Lustre 文件系统中文件/mnt/testfs/frog的这些信息，请运行：
I $ lfs getstripe /mnt/testfs/Erog
2 Lmm_stripe_count：
3 Lnm_stripe_size：
4 Imm_pattern：
5 Lmm_layout_gen：
6 1mm_stripe_offset: 2
obdidx
objid
e2fsprogs包中提供了debugfs工具。它可以用于1diskfs文件系统的交互式调
试，检查文件系统的状态信息或修改文件系统中的信息。在Lustre 文件系统中，属于文
件的所有对象都存储在OST 的底层ldiskfs文件系统中。文件系统使用对象ID 作为文件
名。可通过对象 ID 使用debugfs工具从不同的OST 获取所有对象的属性。
以下是上例中的/mnt/testfs/frog文件的运行模版：
1 $ debugfs -c -R "'stat o/0/d$（（818855 8 32））/818855" /dev/vgmyth/Ivmythost2
3 debugfs 1.41.90.wc3 （28-May-2011）
4 /dev/vgmyth/1vythost2: catastrophic mode - not reading inode or group
bi tmaps
5 Inode: 227649 Type: regular|
Mode: 0666
Flags:0x80000
6 Generation:1375019198 Version: 0x0000002f:0000728f
7 user: 1000 Group: 1000 Size: 2800
8 File ACL: 0 Directory ACL:0

9 Links:1
Blockcount:8
10 Fragment: Address: 0 Number:0
Size:0
11 ctime:Ox4e177fe5:00000000-- Fri Jul 8 16:08:37 2011
12 atime: Ox4d2e2397:00000000 -- Wed Jan 12 14:56:39 2011
13 mtime: Ox4e177fe5:00000000 -- Fri Ju1 8 16:08:37 2011
14 crtime: Ox4c3b5820:a37.4117c -- Mon Jul 12 12:00:00 2010
15 Size of extra inode fields: 28
16 Extended attributes stored in inode body：
Eid= "08 80 24 00 00 00 00 00 28 8a e7 fc 00 00 00 00 a7 7e 0c 00 00 00
00 00
00 00 00 00 00 00 00 00 " （32）
fid: objid-818855 seq=0 parent-［0x248008:0xfce78a28:0x0］ stripe=0
20 EXTENTS：
21 （0）：63331288

### 37.2.7.查找OST 的Lustre UUID

要确定 OST 磁盘的 Lustre UUID（例如，如果您混淆了 OST设备上的电缆或 SCSI
总线编号突然变化且 SCSI 设备获得了新名称），可以使用debugfs从last_rcvd 文件中
提取此信息：
I debugfs -c -R "dump last_rcvd /tmp/last_rcvd" /dev/sdc
2 strings /tmp/last_rcvd | head -1
3 myth-OST0004_UUID
使用dumpe2fs命令也可以（也更容易）从文件系统标签中提取它：
1 dumpe2fs -h /dev/sdc | grep volume
2 dumpe2fs 1.41.90.wc3 （28-May-2011）
3 Filesystem volume name：
myth-OST0004
debugfs和dumpe2fs命令在 debugfs（8） 和 dumpe2fs（8） 手册页中有详细说明。

### 37.2.8. 打印调试消息至控制台

将调试消息转储到控制台（/var/1og/messages），请在printk 标志中设置如下
调试掩码：
1 lct1 set_param printk=-1

但这将极大地降低系统的速度。可使用以下选项为特定标志选择性地

```bash
启用或禁用此功能：lct1 set_param printk=+vfstrace和lctl set_param
```
printk=-vfstrace.
尽管我们强烈建议您运行类似于Ict1 debug_daemon的功能，从而将此数据捕
获到本地文件系统以进行故障检测，但您也可以禁用这些警告、错误和控制台消息。

### 37.2.9. 锁流量跟踪

Lustre 软件为跟踪锁流量提供了特定的调试类型类别。使用：
1 lct1 filter all_types
2 lctl> show dlmtrace
3 lctl> debug_kernel［filename］

### 37.2.10. 控制台消息速率限制

由 Luster 打印的一些控制台消息的速率是有限制的。当处理这样的消息时，
可能会在随后出现一条消息："Skipped N previous similar message（s）”，其中N是跳
过的消息的数量。通过设置名为1ibcfs_console_ratelimit的libcfs 模块参数
可完全禁用这种速率限制。禁用控制台消息速率限制，请将以下这行命令添加
到/etc/modprobe.d/lustre.conf文件中，然后重新加载 Lustre 模块。
1 options 1ibcfs 1ibcfs_console_ratelimit=0
使用模块参数1ibcfs_console_max_delay和1ibcfs_console_min_delay可
以设置速率限制的控制台消息之间的最小和最大延迟。
在/etc/modprobe.d/lustre.conf中进行设置，然后重新加载 Lustre 模块。
有关libcfs 模块参数的更多信息可通过modinfo获得：
1 modinfo libcfs

### 37.3.Lustre开发调试

本节中介绍的内容可能对调试 Lustre 源代码的开发人员非常有用。

### 37.3.1. 在 Lustre 源代码中添加调试功能

调试基础架构提供了许多可在Lustre 源代码中使用的宏，以帮助进行调试或报告严
重错误。
使用这些宏，您需要在文件顶部设置DEBUG_SUBSYSTEM变量，如下所示：
1 #define DEBUG_SUBSYSTEM S_ PORTALS

下表提供了可用的宏列表及其描述。
宏
LBUGO
LASSERTO
LASSERTFO
CDEBUGO
CDEBUG LIMITO
CERRORO
说明
内核中引起 Lustre 文件系统将其循环日志转储到
/tmp/lustre-1og文件的恐慌式断言。该文件
可以在重启后检索。LBUG（ 将冻结线程以完成
恐慌堆栈的捕获。清除线程需重启系统。
验证给定的表达式为 true，否则将调用 LBUGO。
失败的表达式在控制台上输出，但不会显示构成
表达式的值。
和LASSERT（）类似，但允许打印无格式消息，
如 printf/printk。
最基本的、常用的调试宏，它只比标准的 printfO
多一个参数，即调试类型。设置了相应的调试
掩码后，该消息将添加到调试日志。用户稍后
检索日志进行故障排除时，可以根据此类型进行
过滤。如：CDEBUG （D_INFO，"debug message：
rc=%d\n"，number）i。
与 CDEBUGO 行类似，但打印到控制台时对速
度进行了限制（消息类型为D_WARN,D_ERROR
和D_CONSOLE），这对使用可变调试掩码的消息
很有用：CDEBUG（mask，"maybe bad：
rc=ed\n"，rc）；。
在内部使用 CDEBUG_LIMIT （D_ERROR，..），它
无条件地将消息打印到调试日志和控制台中。这适
合用于严重错误或致命条件。打印到控制台的消息
以：LustreErr前缀，并且速率受限，以避免
重复播放控制台。CERROR（"Something bad
happened: rc=%d\n"， rc）；

宏
CWARNO
CNETERRO
DEBUG_REQ0
ENTRY
EXIT
GOTOO
RETURNO
LDLM_DEBUGO 和
LDLM_DEBUG_NOLOCKO
OBD_FAIL_CHECKO
说明
与CERROR（）行为类似，但消息须加上前缀
Lustre：。这适合重要但非致命的错误。打印到控
制台的消息的速率受限。
与CBRROR（）行 类似，但如果在调试掩码中设置
了D_NETERR，则打印 LNet的相关错误消息。这适
合用于严重的网络错误。打印到控制台的消息的速
率受限。
打印给定ptlrpc_request 结构相关消息。
DEBUG_REQ （D_RPCTRACE,re9， "Handled RPC：
rc=8d\n"，rc）；
将消息添加到函数的入口以帮助进行调用跟踪（不
带任何参数）。使用这些宏时，请使用单个E工T，
GOTO（）或RETURN（）宏覆盖所有退出条件，以避
免调试日志报告函数进入后未退出时出现混淆。
标记函数的出口以匹配 ENTRY（不带任何参数）。
标记代码通过got。跳转到函数末尾以匹配
ENTRY，并以有符号和无符号十进制和十六进制
格式打印goto标签和函数返回码。
标记函数的出口以匹配 ENTRY，并以有符号和无
符号十进制和十六进制格式打印函数返回码。
用于跟踪LDLM 锁操作。这些宏将构建一个精简的
跟踪以显示节点上的锁请求。也可使用打印的锁定
手柄在客户端和服务器节点之间将这些宏链接起来。
允许将故障点插入 Lustre 源代码中。这对于生成用
于实现特定事件序列的回归测试非常有用。与
"Ict1 set_param fail_loc=fai1_1oc"一

宏
OBD_FAIL_ TIMEOUTO
OBD_RACEO
OBD_FAIL_ONCE
OBD_FAIL_RAND
OBD_FAIL_SKIP
OBD_FAIL_SOME
说明
起工作可设置一个特定的故障点，并使用给定的
OBD_FAIL_CHECK （）进行测试。
与OBD_FAIL_CHECK（）类似。用于模拟挂起、阻
塞或繁忙的进程或网络设备。如果命中fai1_1oc，
则OBD_EAII_TIMEOUT（）将等待指定的秒数。
与 OBD_FAIL_CHECK（）类似。用于让多个进程同
时执行相同的代码来触发锁竞争。第一个命中
OBD_RACE （）的进程会休眠，直到第二个进程命中
OBD_RACE（），然后两个进程都将继续。
在fail_1oc断点上设置的标志，用于限定
OBD_FATL_CHECK （）条件仅能被命中一次。
否则，在使用"Lct］ set_param fail_10c=0"
清除之前，fai1_1oc将永久存在。
在fai1_1oc断点上设置的标志，使
OBD_FAIL_CHECK （）随机失效；平均为
（1/ail_val）次。
在fai1_10c断点上设置的标志，使
OBD_FAIL_CHECK（）在成功fa11_va1次后永
久失效或只能再被命中一次，即转变为标志
OBD_FAIL_ONCE。
在fai1_1oc断点上设置的标志，使
OBD_FAIL_CHECK （）在失效fai1_va1次后恢复。

### 37.3.2. 访问ptlrpc请求历史

每个服务负责维护一个请求历史记录，这对于首次出现的故障排除很有用。
ptlrpc是LNet 上的一个 RPC 协议，它处理状态性服务器，并且具有语义和内置
的恢复支持。

ptlrpc请求历史记录的工作原理如下：
1.request_in_callback （）添加新请求至服务的请求历史记录。
2. 请求缓冲区空闲时，添加服务请求缓冲区历史列表至缓冲区。
3. 如果缓冲区大小比req_buffer_history_max还大时，则从服务请求缓冲区历
史记录中剔除该缓冲区，其请求从服务请求历史记录中删除。
使用服务目录下/proc文件访问和控制请求历史记录：

- req_buffer_history_len
历史记录中当前的请求缓冲区的数量。

- req_buffer_history_max
允许保留的请求缓冲区的最大大小。

- req_history
请求历史。
历史请求包括当前正在处理的"实时"请求。req_history 中的每一行看起来如下所
示：
I sequence:target _NID:Client_NID:Cliet_xid:request_length:rpc_phase
service_specific_data
参数
说明
seq
请求序列号
target NID 传入请求的目的 NID
Client ID
客户端的 PID 和 NID
xid
length
phase
sve specific
r9_xid
请求消息大小
新（等待处理或无法解压）解析（解压或处理）完成
特定服务的请求打印输出。目前，唯一能做到这一点的服务是OST
（如果消息已成功解压，将打印操作码）


### 37.3.3.使用leak_finder.P1查找内存泄漏

分配内存后，一旦不再需要时必须释放内存，否则将造成内存泄漏。
leak_finder.P1程序提供了一种查找内存泄漏的方法。
在运行此程序之前，您必须启用调试功能以收集所有ma11oc和free条目，运行：
1 lct1 set_param debug=+malloc
随后，完成以下步骤：

```bash
1.使用1ct1将日志转储到用户指定的日志文件中（请参见本章第2.2节"使用 lctl 工
```
具查看调试消息"）。
2. 在新创建的日志转储上运行1eak
_finder.Pl：
perl leak_finder.P1 ascii-logname
输出为：
1 malloced 8bytes at a3116744 （called pathcopy）
2 （Lprocfs
Lstatus.c:lprocfs_add_vars: 80）
3 Ereed 8bytes at a3116744 （called pathcopy）
4 （Iprocfs_status.c:lprocfs_add_vars: 80）
发现的泄漏显示如下：
1 Leak:32bytes allocated at a23a8fc（service.c:ptlrpc_init_svc:144,debug file
line 241）

## 第三十八章 Lustre 文件系统恢复


### 38.1. 概述

Lustre 软件提供的系统恢复功能负责处理节点或网络故障，并将集群恢复到一致、
高效的状态。由于 Lustre 软件允许服务器对磁盘上文件系统执行异步更新操作（即服务
器可以不等待更新同步提交到磁盘就进行回复），因此可能存在客户端内存中的状态比
崩溃后服务器可从磁盘恢复的状态还新的情况。
以下几种不同类型的故障可能导致恢复操作：

- 客户端（计算机节点）故障

- MDS故障（切换）

- OST故障（切换）

- 瞬态网络分区

对于 Lustre 文件系统，故障和恢复操作都基于连接失败的概念；即给定连接相关的
任何读写失败即视为失败。将在本章第6节中介绍的〝强制恢复”功能，允许MGS在目
标发生故障、故障转移或其他中断后并重启时主动通知客户端，以加快恢复速度。
有关 Lustre 文件系统恢复的相关信息，请参见本章第2节"元数据重放”。从损坏的
文件系统中恢复的相关内容请参见本章第3.5节"提交共享”。有关命令性恢复的信息，
请参见本章第6 节"强制恢复"。

### 38.1.1. 客户端故障

Lustre 文件系统中的客户端故障恢复基于锁定撤销和其他资源，因此幸存的客户端
可以不间断地继续工作。如果客户端未能及时响应分布式锁管理器（DLM）的阻塞锁回
调或在很长一段时间都未能内与服务器通信（即ping 无回复），则会将客户端从群集中
强制删除（被驱逐）。这使得其他客户端可以获取该死亡客户端锁所阻止的锁，与该客
户端关联的资源（文件句柄，导出数据）也将被释放。请注意，此状况可能是由网络分
或客户端节点系统故障引起的。第1.5 节"网络分区"对这种情况进行了更详细的描述。

### 38.1.2. 客户端驱逐

如果服务器认为某客户端表现不正常，它将被逐出。这是为了确保在存在行为不当
或故障客户端时整个文件系统继续运行。必须使被驱逐的客户端的所有锁无效，这将导
致所有缓存 inode 也变次无效，所有缓存的数据都将被刷新。
客户端被驱逐的原因可能有：

- 未能及时响应服务器请求

- 阻塞锁回调（即客户端持有另一个客户端/服务器想要的锁）

- 锁完成回调（即客户端被授予之前由另一个客户端持有的锁定）

- 锁glimpse 回调（即客户端被另一个客户端询问对象大小）

- 服务器关闭通知（简化的互操作性）

- 在服务器接收到 RPC流量时，无法及时 ping 通服务器（指向网络分区）。

### 38.1.3. MDS 故障（切換）

高可用性（HA）的 Lustre 文件系统操作要求元数据服务器有故障切换配置的对等
设备，包括用于 MDT 后备文件系统的共享存储设备。对等设备故障检测、对等设备断

电（STONITH，用于防止其继续修改共享磁盘）以及在备份节点上 Lustre MDS 服务的
接管等的实际机制取决于外部HA软件（如Heartbeat）。也可使用单个 MDS 节点进行
MDS 恢复，但此时恢复将花费重启单个 MDS 所需的时间。
启用强制恢复功能，将通知客户端MIDS重新启动（备份或恢复的主服务器）的消
息。客户端可以通过 in-flight 请求超时或空闲时间的ping 消息来检测 MDS故障。在这
两种情况下，客户端都会连接到新的备份MDS并使用元数据重放协议。元数据重放负
责确保备份 MDS 重新获取客户端可见但未提交给磁盘的事务产生的状态。
重新连接到新的（或重启的）MDS 在首次装入文件系统时由客户端加载的文件系统

```bash
配置进行管理。如果已配置故障切換 MDS（使用mkfs.lustre或tunefs.lustre的
```
--failnode=选项），客户端将尝试重新连接到主 MDS 或备用 MDS，直至其中一个响
应使故障 MDT 再次可用。此时，客户端开始恢复。有关更多信息，请参见本章第2节"
元数据重放"。
事务编号用于确保重放按最初的顺序执行，从而使它们成功地呈现与失败前相同
的文件系统状态。此外，客户端将通知新服务器其现有的锁状态（包括尚未授予的锁）。
在允许新的非恢复操作执行之前，必须完成所有元数据和锁重放。此外，只允许MDS
发生故障时连接的客户端在恢复窗口期间进行重新连接，以避免引入可能与先前连接的
客户端重放相冲突的状态更改。
如果正在使用多个 MDT，则可以进行主动一主动故障转移（例如，两个 MDS节
点，每个节点主动为同一文件系统的一个或多个 MDT提供服务）。

### 38.1.4. OST 故障（切换）

当OST 故障或客户端出现通信问题时，默认操作是相应的OSC 进入恢复状态，并
阻止该 OST 的1/0请求直到 OST 恢复或完成故障切换。可在客户端上以管理方式将
OSC 标记为非活动状态，在这种情况下，与故障OST 相关的文件操作将返回10 错误
（-EIO）。否则，应用程序将保持等待状态，一直到 OST 恢复或客户端进程被中断（如
使用 CTRL-C）。
MDS（通过LOV）检测到 OST 不可用，则在分配对象给新文件时将跳过它。重新
启动 OST 或重新建立与MDS的通信时，MIDS 和OST会自动执行孤立恢复，以销毁属
于在 OST 不可用时删除的文件的任何对象。
虽然OSC 到OST操作恢复协议与MDC 和MDT 之间的元数据重放协议相同，但通
常 OST 会向磁盘同步提交批量写入操作，且每个回复都表明请求已提交、数据无需保
存（以用于恢复）。在某些情况下，OST 会在操作（如Lustre 软件较新版本中的 truncate，
destroy，setattr 和1/0操作）提交到磁盘以及正常重放和重新发送（包括重新发送批量
写入）完成前回复客户端。在这种情况下，客户端会保留内存中可用数据的副本，直到
服务器显示写入已提交到磁盘。
要强制执行 OST 恢复，请先卸载 OST，然后重新挂载。如果OST 在故障之前就连

接到客户端，则在重新挂载之后恢复将启动，客户端重新连接到 OST 并重放其队列中
的事务。当 OST 处于恢复模式时，所有新客户端连接都将被拒绝，直到恢复完成。所
有先前连接的客户端完成重新连接和重放事务或客户端连接超时，恢复完成。如果连接
超时，则等待重连的所有客户端（及其事务）都将丢失。
注意
如果您知道 OST 将无法恢复之前连接的客户端（如客户端已崩溃），则可以使用以
下命令手动中止恢复：
1 oss# lct1 --device lustre_device_number abort_recovery
确定OST 设备编号和名称，请运行1ct1 d1 命令。相关输出示例如下：
1 7 UP obdfilter ddn_data-OST0009 ddn_data OST0009_UUID 1159
在此示例中，OST 设备编号为7，名称为ddn_data-OST0009。在大多数情况下，
可以使用设备名称代替设备编号。

### 38.1.5. 网络分区

网络故障可能是暂时的。为避免触发恢复操作，客户端一开始会尝试将所有超时请
求重新发送到服务器。如果重新发送也失败，则客户端会尝试重建与服务器的连接。当
服务器无理由驱逐客户端时，客户端可在重新连接时检测到无害分区。
如果服务器处理了请求，但删除了答复（即没有返回到客户端），则服务器必须在
客户端重新发送请求时重新生成答复，而不是执行两次相同的请求。

### 38.1.6.恢复失败

恢复失败则客户端将被服务器驱逐，并且必须参照上面1.2节"客户端驱逐"中所述，
在该服务器相关的已保存状态被刷新后重新连接。以下是导致恢复失败可能的原因：

- 恢复失败

- 如果一个客户端的操作直接依赖于未能参与恢复的另一个客户端的操作，则恢复
将失败。否则，基于版本的恢复（VBR）允许对所有连接的客户端进行恢复，并
仅驱逐丢失的客户端。

- 手动中止恢复

- 管理员手动执行驱逐操作

### 38.2. 元数据重放

高可用性的Lustre 文件系统操作要求MDS 配置有用于故障转移的对等设备，包括
用于 MDT 后备文件系统的共享存储设备。当客户端检测到MDS 故障时，它会连接到
新的 MDS 并使用元数据重放协议来重放其请求。

元数据重放可确保完成故障转移的 MDS重新收集客户端可见但未提交给磁盘的事
务状态信息。

### 38.2.1.XID编号

客户端发送的每个请求都包含一个XID 编号，该编号是客户端唯一的单调递增的
64位整数。XID 会进行初始化定义，因此在重启后重新连接到同一服务器的同一客户端
节点具有相同的 XID序列的可能性非常小。客户端使用XID 对其发送的所有请求进行
排序，直到请求被分配事务编号。XID 还可用于重新生成回复，以唯一地标识服务器上
的每个客户端的请求。

### 38.2.2. 事务编号

服务器会分配一个事务编号给服务器处理的每个涉及状态更改（元数据更新、文件
打开、写入等，具体取决于服务器类型）的客户端请求。该事务编号对于目标来说是唯
一的，工作于服务器范围，是单调递增的64位整数。每个文件系统修改请求的事务编
号将与客户端请求的回复一起发回客户端。事务编号允许客户端和服务器明确地对每个
文件系统更改进行排序，以便需要时进行恢复。
发送给客户端的每个回复（无论请求类型如何）还包含最后提交事务的编号，显示
了提交给文件系统的事务编号的最大值。Lustre 软件使用的1diskfs和ZES后备文件系
统确保了在随后的磁盘操作开始之前将早期磁盘操作提交到磁盘，最后提交的事务的编
号还指示了任何具有更小事务编号的请求已被提交到磁盘。

### 38.2.3. 重放和重发

恢复 Lustre 文件系统可以分为两种不同类型的操作：重放 （replay）和重发 （resend）。
重放操作针对的是客户端已从服务器收到操作成功的回复的那些操作。在服务器重
启后，需要以和服务器故障前报告的完全相同的方式重新执行这些操作。只有在服务器
发生故障时才能进行重放，否则内存中并不会丢失任何状态。
重发操作针对的是客户端从未收到回复的那些操作，也就是说客户端并不知道它们
的最终状态。客户端按照 XID 的顺序再次向服务器发送未应答的请求，并等待每个请求
的回复。在某些情况下，重新发送的请求已由服务器处理并提交到磁盘（可能还提交了
相关操作），则服务器将重新生成丢失的回复。在其他情况下，服务器根本没有收到请
求（网络中断会发生这种状况），将像处理任何正常请求一样重新处理这些请求。服务
器也可能收到了请求，但在发送故障前无法回复或提交到磁盘。


### 38.2.4. 客户端重放列表

在服务器发生故障的情况下，进行服务器状态恢复（重放）可能需要所有文件系统
修改请求。所收到的来自服务器的包含比最后提交的事务编号更大的事务标号的回复将
被保留重放列表中，每个服务器都有一个这样的重放列表。也就是说，当从服务器接收
到回复时，检查它是否具有比先前的最后提交的事务编号还大的事务编号。大多数具有
较小事务编号的请求可以安全地从重放列表中删除。请注意，“打开请求”在这里是一个
例外，它需要保存在重放列表中直到文件关闭，以便MDS 可以正确引用open-unlinked
文件的计数。

### 38.2.5. 服务器恢复

如果服务器未完全关闭，则会进入恢复状态。服务器启动时，如果先前连接的客户
端在1ast_rcvd文件中有任何客户端条目，则服务器进入恢复模式，等待这些客户端
重新连接并开始重放或重发其请求。这将允许服务器重建已暴露给客户端（成功完成的
请求）但在故障前未提交到磁盘的状态。
不进行任何客户端连接尝试的情况下，服务器将无限期地等待客户端重新连接。这
旨在处理服务器存在网络问题时客户端无法重连或需要反复重启服务器来解决硬件或软
件问题的情况。一旦服务器检测到客户端的连接尝试（新客户端或先前连接的客户端），
无论先前连接的客户端是否可用，恢复计时器都将启动并强制在有限时间内完成恢复。
如果last
rcvd文件中没有客户端条目，或管理员手动中止恢复，则服务器不会
等待客户端重新连接，而是允许所有客户端进行连接。
当客户端连接时，服务器从每个连接处收集信息以确定需要多长时间来完成恢复。
每个客户端将报告其连接UUID，服务器在last_rcvd文件中查找此UUID 来确定此客
户端之前是否已连接。如果没有，将拒绝此客户端的连接直到恢复完成。每个客户端会
报告最近一次的事务，以便服务器获知何时所有事务完成重放。客户端还会报告先前等
待请求完成的时间，用于帮助服务器估计某些客户端可能需要多长时间来检测服务器故
障并重新连接。
如果客户端在重放期间超时，则会尝试重新连接。如果客户端无法重新连接，
则REPLAY失败并返回DISCON状态。客户端可能会在REPLAY期间频繁地超时，因此重
新连接不应该使已经很慢的进程延迟过久。我们可以通过在重放期间增加超时时间来缓
解这种情况。

### 38.2.6.请求重放

如果客户端先前已连接，则会从服务器得响应，得知服务器正在进行恢复，并获
知磁盘上最后提交的事务编号。然后，客户端便可以遍历其重放列表并使用此最后提交
的事务编号来删除任何先前提交的请求。它按照事务编号的顺序向服务器重放任何较新

的请求，一次一个，收到服务器的回复后再重放下一个请求。
重放列表上的”打开请求"的事务编号可能小于服务器上次提交事务的编号。服务
器将立即处理这些打开请求，然后再按照事务编号顺序处理来自客户端的重放请求。从
最后提交事务的编号开始，确保状态在磁盘上以与故障之前完全相同的方式更新。在处
理每个重放请求时，最后提交的事务编号将递增。如果服务器从客户端收到大于当前的
最后提交事务编号的重放请求，则该请求会被搁置，直到其他客户端发起干预事务。服
务器以这种方式按照先前在服务器上执行的相同顺序重放请求，直到所有客户端无请求
可重放或序列中存在间隙。

### 38.2.7. 重放序列中的间隙

在某些情况下，回复序列中可能会出现间隙。这可能是回复丢失引起的，即请求已
处理并提交到磁盘，但客户端未收到回复；也可能是由于部分网络故障或客户端崩溃导
致回复无法发送至客户端造成的。
在所有客户端都已重新连接但重放序列仍存在间隙的情况下，唯一的可能是服务器
处理了一些请求但是回复丢失了。客户端必须在其重发列表中包含这些请求，以便恢复
完成后进行重发。
如果所有客户端都未重新连接，则故障客户端可能有不会再被重放的请求。VBR
功能可用于确定间隙之后的请求是否可以被安全地重放。文件系统中的每个条目（MDS
inode 或OST 对象）将在磁盘上存储被修改的最后事务编号。来自服务器的每个回复都
包含它所作用的对象先前的版本号。在VBR重放期间，服务器将重新发送请求中的先
前版本号与当前版本号进行匹配。如果版本匹配，则请求将作用于对象，且可以安全地
进行重放。有关更多信息，请参见本章第4节"基于版本的恢复”。

### 38.2.8. 锁恢复

如果所有请求都成功重放且所有客户端都重新连接，客户端会进行锁重放。每个客
户端都会发送它从此服务器获取的每个锁的信息以及其状态（无论何时被授予、什么模
式、什么属性等），随后恢复成功完成。
目前，Lustre 软件不进行锁验证，而是信任客户端呈现准确的锁状态。这不会带来
任何安全问题，因为 Lustre 软件版本1.x 客户端的其他信息（如用户ID）在正常操作期
间也是可信任的。
在重放了所有已保存的请求和锁之后，客户端发送一个MDS
_GETSTATUS请求并设
置1ast-replay标志。在所有客户端都完成重放（发送带有相同标记的 getstatus 请求）
前，该请求的回复将被阻止，以便客户端在恢复完成之前不发送非恢复请求。


### 38.2.9. 请求重发

一旦服务器上恢复了所有先前共享的状态（目标文件系统更新至客户端缓存，且
服务器已重建客户端持有的锁），客户端就可以重新发送任何之前没有得到答复的请求。
该处理与正常请求的处理类似，在一些情况下，服务器可以进行重新生成回复。

### 38.3.重建回复

当回复丢失时，MIDS 需要能够在原始请求被重新发送时重建回复。在保持锁定系
统的完整性的同时，必须在不重复任何非幂等操作的情况下完成此操作。MDS 故障切
换时，用于重建回复的信息必须在与磁盘上进行组合或嵌套事务的序列化。

### 38.3.1. 所需状态

对于大多数请求来说，服务器在last_rcvd文件中存储三种数据就足够了：

- 请求的 XID

- 产生的事务编号（如果有的话）

- 结果代码 （req->rq_status）
对于"打开请求"来说，请求的处置信息也必须保存。

### 38.3.2. 重建"打开请求”的回复

"打开请求"的回复最多包含三条信息（除了"请求日志"的内容）：

- 文件句柄

- 锁句柄

- mds_body 以及所创建文件的相关信息（O_CREAT）
处置、状态和请求数据（由客户端重新发送的完整数据）足以确定所授予的是哪种
类型的锁句柄、是否创建了打开文件句柄，以及应在mds_body中描述的资源。

### 38.3.2.1. 查找文件句柄 文件句柄可以在请求的 XID 和每个导出的打开文件句柄列表中

找到。

### 38.3.2.2. 查找资源/FID 文件句柄包含资源/FID。


### 38.3.2.3. 查找锁句柄 可以通过遍历相应远程文件句柄（显示在重发的请求中）下资源

所授予的锁列表来查找锁句柄。验证锁的模式是否正确（通过执行上面的处置/请求/状
态分析来确定），以及是否被授予至适当的客户端。


### 38.3.3. 客户端上的多个回复数据

从 Lustre 2.8起，MDS 可为每个客户端保存多个回复数据。回复数据存储在MDT
的内部文件rep1Y_data中。除了请求的XID、事务编号、结果代码和打开请求的处置
信息外，得益于last_rcvd文件的内容，回复数据包含了可用于标识客户端的版本号。

### 38.4. 基于版本的恢复

可使用基于版本的恢复（VBR）功能来处理在恢复期间无法重放的客户端请求
（RPC），从而提高Lustre 文件系统的可靠性。
在无 VBR 功能的之前的 Lustre 版本中，如果 MGS 或OST发生故障将触发恢复操
作，客户端会尝试重放其请求。客户端只允许按顺序重放RPC。如果特定客户端无法重
播其请求，那么这些请求以及后续序列中的客户端请求都将丢失。由于必须等待更早的
RPC完成，"下游"客户端将永远不会重放它们的请求。最终，恢复期将超时（因此组件
可以接受新请求），导致一些客户被驱逐，其请求和数据丢失。
使用VBR后，恢复机制不会导致客户端或其数据丢失，这是因为对 inode 版本的更
改进行了跟踪，更多客户端能够重新集成到集群中。使用 VBR 进行 inode 跟踪：

- 每个 inode 存储一个版本号，即 inode 更改的最后事务编号（transno）。

- 当要更改inode 时，inode 的操作前版本号将被保存在客户端的数据中。

- 客户端保留操作前 inode 版本号和操作后版本号（事务编号），并在服务器发生故
障后发送它们。

- 如果操作前后版本匹配，则重放请求。在请求中修改的所有 inode 上分配操作后的
版本号。
注意
因为操作中可能涉及多个 inode，RPC 最多可包含四个预操作版本。进行"重命名"
操作时，可以修改四个不同的 inode。
在正常操作期间，服务器：

- 更新给定操作中涉及的所有 inode 的版本。

- 将旧的和新的 inode 版本返回给客户端。
当恢复正在进行时，VBR 遵循以下步骤：
1. 只有当受影响的 inode 有与原始执行事务时版本相同时，VBR 才允许客户端重放
事务（即使因客户端丢失导致事务序列存在间隙）。
2. 服务器尝试执行客户端发起的每个事务（即使重新集成失败）。

3. 重放完成后，客户端和服务器会检查是否有事务因 inode 版本不匹配而失败。如果
版本匹配，则客户端会收到成功完成重新集成的消息。如果版本不匹配，则客户
端被驱逐。
VBR 恢复对用户完全透明。如果集群在服务器恢复期间有多个客户端丢失，则可
能会延长恢复时间。

### 38.4.1. VBR 消息

一些 VBR 消息：
VBR 功能内置于 Lustre 文件系统恢复功能，它无法被禁用。以下是可能会显示的
1 DEBUG_REQ（D_WARNING, reg， "Version mismatch during replayn"）；
该消息提示了客户端被驱逐的原因。无需任何操作。
1 CWARN（"es: version recovery fails, reconnecting\n"）；
该消息提示了恢复失败的原因。无需任何操作。

### 38.4.2. VBR 使用建议

一般来说，VBR 在不与其他客户端共享数据的客户端上会成功。因此，为了更可靠
地使用 VBR，应尽可能将客户端的数据存储在自己的目录中。在这种情况下，即使其他
客户端丢失，VBR 也可以恢复这些客户端。

### 38.5. 共享提交

共享时提交（Commit On Share,COS）功能增加了 Lustre 文件系统恢复的可靠性，
因为该功能可以防止被驱逐的客户端连带着引起其他客户端被驱逐。启用COS后，如
果一些 Lustre 客户端在服务器重启或故障后错过了恢复窗口，剩下的客户端不会因此被
驱逐。
注意
COS 功能默认启用。

### 38.5.1.COS 的工作原理

为了说明CoS 是如何工作的，让我们先看一下没有COS 的恢复方式。在服务重启
后，MDS 将启动并进入恢复模式。客户端开始重新连接并重新执行他们未提交的事务。
客户端可以独立地重新执行事务，只要这些事务不相互依赖（一个客户端的事务不依赖
另一个客户端的事务）。MDS 能够通过基于版本的恢复（Version-based Recovery）这一
功能来确定一个事务是否依赖于另一个事务。

如果客户端事务之间存在着依赖关系（例如，创建和删除同一个文件），而其中一
个或多个客户端没有及时地重新连接，那么这些客户端可能因为它们的事务依赖于被驱
逐的客户端的事务，因而跟着被驱逐。而驱逐这些客户端又回导致更多的客户端被驱
逐，从而导致客户端接二连三地被级联驱逐。
COS通过消除客户端之间的事务依赖来解决级联驱逐的问题。如果另一个客户端
的事务依赖于此客户端的某事务，COS 会确保将该事务提交到磁盘。由于客户端不会依
赖于其他客户端的未提交事务，因此客户端可以独立地重放其请求而不会被驱逐。

### 38.5.2.COS调试

可以使用mdt.commit_on_sharing可调参数 （0/1）来启用或禁用 COS。
此参数可以使用lct1 set/get_param或lct1 conf_param命令在创建 MDS

```bash
（mkfs.lustre）或Lustre 文件系统处于活动状态时进行设置。
```
在文件系统创建时为COS（禁用/启用）设置默认值，请使用：
1 --param mdt.comit_on_sharing=0/1
在文件系统运行时启用或禁用 COS，请使用：
1 lct1 set_param mdt.*.commit_on_sharing=0/1
注意
启用COS 可能会导致MDS执行大量同步磁盘操作，从而损害性能。可
将1diskfs 日志放在低延迟外部设备上来提高文件系统性能。

### 38.6. 强制恢复

大规模Lustre 文件系统在其生命周期中难免遇到服务器硬件故障等问题。在发生这
种故障后，服务能够及时恢复显得尤为重要。高可用软件可自动将存储目标服务转移到
备份服务器上。客户端可以通过 RPC 超时来检测服务器故障的出现，而RPC超时时间
必须随着系统规模的扩大而进行调整，以防止在负载较大的情况下错误地判定服务器死
亡。祈使式恢复 （Imperactive Recovery）的目的是，通过主动告知客户端服务器发生了
故障，来缩短恢复窗口，并由此最大限度地减少目标停机时间，从而提高整个系统的可
用性。
祈使式恢复并没有覆盖以前的恢复机制，当祈使式恢复启用时，仍然可以在集群中
进行基于客户端超时的恢复，因为每个客户端仍然可以独立地从目标上断开和重新连
接。在支持祈使式恢复的客户端和不支持祈使式恢复的客户端混合连接到 OST 或MDT
的情况下，祈使式恢复不能缩短服务器的恢复超时窗口，因为不能确保所有客户端都及
时收到了服务器重新启动的通知。即使在这样的混合环境中，完成恢复的时间也可能缩
短，因为支持祈使式恢复的客户端仍然会接到通知，及时重新连接到服务器，一旦最后
一个不支持祈使式恢复的客户端检测到服务器故障，就能完成恢复。


### 38.6.1. MGS 的作用

在祈使式恢复机制中，MGS以目标状态表（Target Status Table）的形式持有关于
Lustre 目标的额外信息。在MGS上，每当注册一个目标时，在该表中就要增加相应的
条目来识别该目标。该条目包含了 NID 信息，以及目标的状态/版本信息。当客户端挂
载文件系统时，会以Lustre 配置日志的形式，缓存并锁定该表的一个副本。当目标重启
时，MGS 撤销了客户端的锁，强制所有客户端重新加载该表。所有的新目标将获得一个
新的版本号，客户端检测到了版本号的更新，就会重新连接到重启的目标上。祈使式恢
复要能成功将服务器的重启通知给所有客户端，有赖于客户端已经在 MGS上的注册好，
而在 MGS重启的情况下，因为没有其他节点可以通知客户端，所以MGS在第一次启动
时将禁用IR一段时间。这个时间间隔是可以配置的，将在6.2节"R 调试”中进行介绍。
由于 MGS 在恢复中至关重要，因此强烈建议 MGS节点与MIDS分开。如果 MGS
位于MIDS 节点上，那么在MIDS/MGS 故障的情况下，MDS 的重启将无法使用祈使式恢
复机制，客户端只能始终对MDS使用基于超时的恢复。在OSS 故障和恢复的情况下，
仍然会使用祈使式恢复机制。
不幸的是，MGS无法知晓有多少客户端已成功收到通知，或某个特定客户端是否
已收到重新启动的目标信息。MGS 唯一能做到的就是，告诉目标所有客户端都具有祈
使式恢复能力，因此没有必要等所有客户端完成重新连接。出于这个原因，我们仍需使
用目标端的超时策略，但是此超时值可能比正常恢复的超时值短得多。

### 38.6.2. IR 调试

IR 的参数存在默认设置，这意味无需额外进行配置它就可以工作。但是，默认参数
仅适用于通用配置。以下讨论了 IR 的配置项。

### 38.6.2.1. ir_factor Ir.

factor 用于控制目标的恢复窗口。如果启用了IR，则可通过以下
方式计算重新启动放入目标的恢复超时窗口：new timeout = recovery_time *
ir_factor / 10。
Ir factor 必须在［1,10］范围内，其默认值为5。
为目标testfs-OST0000将IR 超时设置为正常恢复超时时间的80%
1 1ct1 conf_param obdfilter.testfs-OST0000.ir_factor=8
注意
如果此值对于系统来说太小，则可能导致不必要的客户端驱逐。可使用1ct1
get_param以标准方式读取当前参数值：
1 # 1ct1 get_param obdfilter.testfs-OST0000.ir_factor
2 # obdfilter.testfs-OsT0000.ir_factor=8


### 38.6.2.2. 禁用IR 可以通过挂载选项手动禁用IR。例如，通过以下方式在OST上禁用

IR：

```bash
1 # mount -t lustre -onoir /dev/sda /mnt/ost1
```
IR 也可在客户端上通过同样的挂载选项禁用：

```bash
1 # mount -t lustre -onoir mymgsnid@tap: /testfs /mnt/testfs
```
注意
当通过这种方式停用某个客户端的IR 时，MGS将停用整个集群的IR。启用IR的
客户端仍将获得目标重启的通知，但不允许目标缩短恢复窗口。
您还可以通过将"state = disabled" 写入控制 procfs 条目来全局禁用 MGS上的IR。
1 # lct1 set_param mgs.MGS.live.testfs="state-disabled"
以上命令将禁用文件系统 testfs 的 IR。

### 38.6.2.3. 查看IR 状态—MGS 您可以从 MGS上获取IR 状态信息。我们来看下面的例

子：
1 ［mgs］s lct1 get_param mgs.MGS.live.testfs
2….
3 imperative_recovery_state：
state:ful1
nonir_clients: 0
nidtbl_version: 242
notify_duration_total: 0.470000
notify duation max: 0.041000
notify_count:38
条目
state
nonir_clients
nidtbl_version
说明
full:IR 正在工作，所有客户端已连接上并能够接收到通知。
partial：部分客户端没有启用 IR。
disabled: IR 被禁用，没有客户端能接收到通知
startup:MGS 刚刚！启动，并非所有的客户端重新连接到
MGS。
系统中不支持 IR 的客户端数量。
目标状态表的版本号。客户端版本必须与 MGS 匹配。

条目
notify_duration_total
notify_duration_max
notify_count
说明
［秒/毫秒］MGS 通知所有客户端所花费的总时间
［秒/毫秒］MGS通知单个 IR 客户端花费的最长时间
通知客户端的数量。（可通过notify_duration_total
除以 notify_count来计算平均通知时间）

### 38.6.2.4. 查看IR 状态-客户端 IR 中的“客户端"指的是 Lustre 客户端或 MDT。您可

以在运行客户端或MIDT 的任何节点上获取 IR 状态，这些节点将始终运行 MGC。我们
来看下面的例子：
1 ［client］$ lct1 get_param mgc.*.ir_state
2 mgc.MGC192.168.127.6@tcp.ir_state=
3 imperative_recovery: ON
4 client_state：
- ｛ client: testfs-client, nidtbl_version: 242 ｝
以及来自 MDT 的例子：
1 mgc.MGC192.168.127.6etcp.ir_state=
2 imperative_recovery: ON
3 client_state：
- ｛ client: testfs-MDT0000, nidtbl_version: 242 ｝
条目
说明
imperative_recovery
imperative_recovery可为ON 或OFF。一般情
况下应次ON。如果为OFF，则管理员在挂载时禁
用了IR。
client_state: client：
客户端名称
client_state: nidtbl_version
目标状态表的版本号。客户端版本必须与MGS匹配。

### 38.6.2.5. 目标实例编号 目标实例编号用于确定客户端是否连接到目标的最新实例。我

们使用挂载计数的最低的32位作为目标实例编号。在OST 上获取 testfs-OST0001 的目
标实例编号：

I $ lct1 get_param obdfilter.testfs-OST0001*.instance
2 obdfilter.testfs-OST0001.instance-5
从客户端上查询相关 OSC：

```bash
1 $ lctl get_param osc.testfs-OST0001-osc-*.import Igrep instance
```
instance: 5

### 38.6.3. IR 配置建议

过去，我们通常在同一个目标上创建MGS和 MDT0000 来保存服务器节点。但为
了使IR更高效地工作，我们强烈建议您在单独的节点上运行 MGS。这样做有三个主要
优点：
1. 在 MDT0000 恢复时能通知客户端。
2. 改进负载平衡。MIDS上的负载可能非常大，从而导致MGS 可能无法及时通知客
户端。
3. 健壮性。与MDS代码相比，MGS 代码更简单也更小。这意味着软件错误导致
MGS 停机的可能性非常低。

### 38.7. Ping 抑制

在具有大量客户端和 OST 的集群上，OBD.
_PING消息可能会带来显着的性能开销。
此处存在一个抑制 ping 的选项作为中间解决方案，大大减少了 ping 的开销。在启用此
选项之前，管理员应认真考虑以下要求并权衡得失：

- 当抑制 ping 时，目标无法检测到客户端的死亡，因为客户端不发送仅为保持其连
接存活的 ping。因此，需另行设置Lustre 文件系统外部机制用于及时通知 Lustre
目标客户端死亡情况，从而使过时连接不会存在太久、死亡客户端的锁回调不需
要总是等待超时。

- 如果没有 ping，客户端必须依靠 IR 来通知目标故障以及时加入恢复。这表明客户
端应该保持其 MGS 连接的活跃性。因此，一方面建议使用高可用性的独立 MGS，
另一方面，无论选项如何设置，都应始终发送 MGS ping。

- 如果客户端有未提交的请求，且没有在连接上发送任何新请求，则即使应该抑制
ping，它还是会继续 ping 该目标。这是因为客户端需要查询目标的最后提交事务
编号，以释放本地未提交的请求（以及可能的其他相关资源）。但是，一旦释放了
所有未提交的请求，或者需要发送新请求，这些ping 就应该停止。


### 38.7.1.内核模块参数"'suppress_pings"

用于控制 ping 是否被抑制的新选项是作为 ptlrpe 内核模块参数"suppress_pings"来实
现的。在服务器上将其设置为"1”，则对该服务器上的所有目标都后用 ping 抑制。保留
默认值"0”则会继续进行先前的 ping操作。在客户端和MGS上，该参数被忽略。我们建
议您通过 modprobe.conf（5）机制来永久地设置该参数，也可以通过 sysfs进行在线更改。
请注意，在线更改仅影响以后建立的连接，现有连接的 ping 行为保持不变。

### 38.7.2. 客户端死亡通知

在客户端死亡通知中应将死亡客户端的 UUID 写入目标的"evict_client" procfs 条目
中：
1 /proc/fs/lustre/obdfilter/testfs-OST0000/evict_client
2 /proc/fs/lustre/obdfilter/testfs-OST0001/evict_client
3 /proc/fs/lustre/mdt/testfs-MDT0000/evict」
_client
客户端的 UUID 可通过它们的"uuid" procfs 条目获取：
1 /proc/fs/lustre/11ite/testfs-ffff8800612bf800/uuid

## 第三十九章 Lustre 参数


### 39.1.简介

Lustre 参数和统计文件为内核中的内部数据结构提供了接口，从而监视和调试
Lustre 文件系统和应用程序性能。这些数据结构包括组件（如内存、网络、文件系统和
内核管理程序）的设置和指标，在整个分层文件布局中都可用。
一般来说，通过1ct1 get_param文件获取指标结果，通过1ct1 set_param更
改设置。有些数据只存在于服务器上，有些数据只存在于客户端上，有些数据是从客户
端导出到服务器的，因此在两个位置都有
注意
在本章的例子中，#表明命令在运行在 root 用户下。Lustre 服务器按照
fsname*-*MDT |OSTnumber的惯例命名。这里我们使用了 UNIX 标准通配符（*）。
以下是一些示例：

- 从 Lustre 客户端获取数据：
1 # lct1 list_param osc.*
2 osc.testfs-OST0000-osc-ffff881071d5cc00
3 osc.testfs-OST0001-osc-ffff881071d5cc00

4 osc.testfs-OST0002-osc-ffff881071d5cc00
5 osc.testfs-OST0003-osc-ffff881071d5cc00
6 osc.testfs-OST0004-osc-ffff881071d5cc00
7 osc.testfs-OST0005-osc-ffff881071d5cc00
8 osc.testfs-OST0006-osc-ffff881071d5cc00
9 osc.testfs-OST0007-osc-ffff881071d5cc00
10 osc.testfs-OST0008-osc-ffff881071d5cc00
可在客户端获取的 OST 连接相关消息显示如上。

- 查看不同级别的参数，请使用多个通配符：
1 # lct1 list_param osc.*，*
2 osc.testfs-OST0000-osc-ffff881071d5cc00.active
3 osc.testfs-OST0000-osc-ffff881071d5cc00.blocksize
4 osc.testfs-OST0000-osc-ffff881071d5cc00.checksum_type
5 osc.testfs-OST0000-osc-ffff881071d5cc00.checksums
6 osc.testfs-OST0000-osc-ffff881071d5cc00.connect_flags
7 osc.testfs-OST0000-osc-ffff881071d5cc00.contention_seconds
8 osc.testfs-OST0000-osc-ffff881071d5cc00.cur_dirty_bytes

- ••
10 osc.testfs-OST0000-osc-ffff881071d5cc00.rpc_stats

- 使用 1ct1 get_param查看指定文件：

```bash
# lct1 get_param osc.lustre-OST0000*.rPC_stats
```
使用带有文件完整路径的cat命令也可以查看数据。cat命令的格式与lct1
get_param类似，但也有一些差异。多年来，Linux 内核在不断变化，统计信息和参数
文件的位置也随之发生了变化。这意味着 Lustre 参数文件可能位于/proc目录、/sys目
录或（和）/sys/kerne1/debug目录，具体取决于内核版本和正在使用的Lustre 版
本。1ct1命令将脚本与这些更改隔离，除非作为高性能监视系统的一部分，否则优先
使用直接文件访问方式。cat命令：

- 将路径中的：'替换为”。

- 在路径前面附加相应的如下内容：
/｛proc, sys｝/｛fs,sys｝/｛lustre, lnet｝
Ict1 get_param 命令可能如下所示：

1 # 1ctl get_param osc.*.uuid
2 osc.testfs-OST0000-osc-ffff881071d5cc00.uuid=594db456-0685-bd16-f59b-e72ee90e9819
3 osc.testfs-OST0001-osc-ffff881071d5cc00.uuid=594db456-0685-bd16-f59b-e72ee90e9819
4 ⋯.
相应地，cat 命令可能如下所示：
1 # cat /proc/fs/lustre/osc/ */uuid
2 594db456-0685-bd16-£59b-e72ee90e9819
3 594db456-0685-bd16-£59b-e72ee90e9819
4•••
或：
1 # cat /sys/fs/lustre/osc/ */uuid
2 594db456-0685-bd16-£59b-e72ee90e9819
3 594db456-0685-bd16-£59b-e72ee90e9819
4 ⋯.
11stat 工具可用于监控指定的一段时间内的一些 Lustre 文件系统I/O 活动。
某些数据是从连接的客户端导入的，位于 Lustre 服务器上相应的服务目录中名
为exports的目录中。例如：
1 oss:/root# lct1 1ist_param obdfilter.testfs-OST0000.exports.*
2 # hash 1dlm_stats stats uuid

### 39.1.1. 识别 Lustre 文件系统和服务器

MGS上的几个参数文件列出了现有的 Lustre 文件系统和文件系统服务器。以下示
例适用于名为testfs的Lustre 文件系统（包含一个 MDT 和三个 OST）。

- 查看所有已知 Lustre 文件系统，输入：
mgs# lct1 get_param mgs.*.filesystems testfs

- 在运行有至少一个服务器的文件系统上查看所有服务器名：
lct1 get_param mgs.*.live.<filesystem name>
如：
2 mgs# lct1 get param mgs.*
.live.testfs
3 fsname: testfs

4 flags: 0x20
gen:45
5 testfs-MDT0000
6 testfs-OST0000
7 testfs-OST0001
8 testfs-OST0002
10 Secure RPC Config Rules：
12 imperative_recovery_state：
13 state: startup
14 nonir_clients: 0
I5 nidtbl_version: 6
16 notify_duration_total: 0.001000
17 notify_duation_max: 0.001000
18 notify_count: 4
19、、

- 查看文件系统中所有在线的服务器，即/proc/fs/lustre/devices的列表，输
入：
1 # lct1 device_list
2 0 UP mgs MGS MGS 11
3 1 UP mgc MGC192.168.10.34@tcp 1f45bb57-d9be-2ddb-c0b0-5431a49226705
4 2 UP mdt MDS MDS_uuid 3
5 3 UP lov testfs-ndtlov testfs-mdt1ov_UUID 4
6 4 UP mds testfs-MDT0000 testfs-MDT0000_UUID 7
7 5 UP osc testfs-OST0000-osc testfs-mdt1ov_UUID 5
8 6 UP osc testfs-OST0001-osc testfs-ndt1ov_UUID 5
9 7 UP lov testfs-clilov-ce63ca00 08ac6584-6c4a-3536-2c6d-b36cf9cbdaa04
10 8 UP mdc testfs-MDT0000-mdc-ce63ca00 08ac6584-6c4a-3536-2c6d-
b36cf9cbdaa05
11 9 UP osc testfs-OST0000-osc-ce63ca00 08ac6584-6c4a-3536-2c6d-b36cf9cbdaa05
12 10 UP osc testfs-OST0001-osc-ce63ca00 08ac6584-6c4a-3536-2c6d-b36cf9cbdaa05
每一行包括以下内容：
-设备编号
-设备状态（UP、INactive 或 STopping）

-设备名
- 设备 UUID
- 引用计数（该设备有多少用户）

- 显示任一服务器名，查看设备标签：
mds#
e2label /dev/sda testfs-MDT0000

### 39.2. 多块分配的调试（mballoc）

mballoc功能包括：

- 单个文件的预分配，减少碎片。

- 组文件的预分配，将小文件打包成大的、连续的块。

- 流分配，降低搜索率。
以下是可用的mbal1oc可调参数：
参数
说明
mb_max_to_scan
在最终决定前mba11oc搜索的最多的空闲块数，用于避免活
mb_min_to_scan
mb_order2_req
mb_smal1
_req
锁情况。
在分配最佳块前mba11oc搜索的最少的空闲块数，用于避免
大容量空间块被小的请求碎片化。
对于大小为2N（N>=mb_order2_req）的请求，使用基
数为2的伙伴分配服务进行快速搜索。
mb_smal1_reg一定义小请求的上限（以MB 为单位）
请求根据大小进行不同的处理，当其小于
mb_smal1_req 时，请求会被打包在一起形成大型的聚合请
求；当其大于mb_sma11_req 且小于mb_large_req时，
请求基本是按线性分配的。当其大于 mb_large_req时，
请求会被立即分配（此时硬盘搜索时间问题不大）。
也就是说，通常会把小请求组合成大请求，然后再将这些
请求靠近放置从而把访问数据所需的查找次数降到最低。

参数
mb_large_req
prealloc_table
mb_grouP_prealloc
说明
mb_large_req一定义大请求的下限（以MB为单位）
收到新请求时预分配空间的相应值列表。默认情况下，表格为：
prealloc_table 4 8 16 32 64 128 256 512 1024 2048。
收到新请求时，会预分配表格中指定的下一个更高的增量。例
如，对于少于4个文件系统块的请求，预先分配4个空间块；对
于4到8之间的请求，预先分配8个块。虽然可以在表格中使用自
定义值，但修改表格通常不会提高文件系统的通用性能（注意，
在ext4 系统中，表值是固定的）。但是，对于某些专用工作负
载，调整prealloc_table值可能会产生更明智的预分配决策。
为一组小请求预分配的空间大小（以KB为单位）
/sYs/fs/ldiskfs/disk_device/mb_groups中的伙伴组缓存信息可用于评
估磁盘碎片。例如：
1 cat /proc/fs/1diskfs/100p0/mnb_groups
2 #group: Eree free frags first pa ［ 2^0 2^1 2^2 2^3 2^4 2^5 2^6 2^7 2^82^9
4 #0
2^10 2^11 2^12 2^13］
：2936 2936 1
］
［0oo 1
1 1120
各列内容为：

- #组编号

- 组内可用块数

- 磁盘空闲块数

- 空闲片段号

- 组内第一个空闲块

- 预分配组块（chunk）编号

- 一串大小不同的可用组块（chunk）

### 39.3. Lustre 文件系统1/O 监控

有许多系统实用程序能够在 Lustre 文件系统中收集1/O 活动相关数据。通常，所收
集的数据描述了：


- Lustre 文件系统外部的数据传输速率和输入输出吞吐量，例如网络请求或执行的
磁盘1/O 操作

- Lustre 文件系统内部数据的吞吐量或传输速率的数据，例如锁或分配情况。
注意
强烈建议您完成Lustre 文件系统的基准测试，以确定硬件、网络和系统工作负载的
正常1/O活动。通过基准数据，您可以轻松地判断系统性能何时可能会降低。以下是两
个特别有用的基准测试的统计数据：

- brw_stats一描述对OST的I/O请求有关数据的直方图。更多详细信息请参见
本章第3.5 节"OST 块1/O 流监控"。

- rpC_stats-描述客户端 RPC有关数据的直方图。更多详细信息请参见本章第

### 3.1节"客户端 RPC流监控"。


### 39.3.1.客户端RPC流监控

文件包含了显示自上次清除此文件以来进行的远程过程调用（RPC）信息的直方图
数据。将任何值写入rpc_stats 文件将清除直方图数据。
示例：
1 # lct1 get_param osc.testfs-OST0000-osc-ffff810058d2f800.rpc_stats
2 snapshot_time：

### 1372786692.399858 （secs.usecs）

3 read RPCs in flight：
4 write RPCs in flight：
s dio read RPcs in flight: 0
6 dio write RPCs in flight: 0
7 pending write pages：
8 pending read pages：
read
11 pages per rpc
FPCS
oe cum oe
|
12 1：
13 2：
FPCS
write
oe cum ae
0〇。
14 4：
15 8：
16 16：
17 32：

18 64：
19 128：
20 256：
850 100 100
I
read
23 rpcs in flight rpcs
op cum op
|
24 0：
691 81 81
25 1：
5 86
26 2：
3 90
27 3：
2 92
284：
1 93
一
29 5：
1 95
30 6：
1 96
I
31 7：
3 100
32 8：
0 100
read
35 offset
rpcs 8 cumd |
36 0：
850 100 100
|
37 1：
0 100
38 2：
0 100
39 4：
0 100
40 8：
0 100
41 16：
0 100
42 32：
0 100
43 64：
0 100
|
44 128：
0 100
18346 99 100
write
rpcs oe cum de
17409 9
5 14
5 20
1052 5 26
5 31
425 2 33
2 35
11373 61 97
2 100
write
rpcs oe cum de
18347 99 99
0 99
0 99
0 99
1 099
1|
0 99
0 100
题头信息包括：
．snapshot_time 一文件读取的 UNIX epoch 瞬间。

- read RPCs in flight - OSC发出的在此时还未完成的read RPCs数。该值应
该永远小于或等于 max_rpcs_in_f1ight。

- write RPCs in flight - OSC 发出的在此时还未完成的 write RPCs 数。该值
应该永远小于或等于max_rpcs_in_flight。

- dio read RPCs in flight -已发起但尚未完成的 read RPCs的直接I/O（对
应于阻塞I/O）。


- dio write RPCs in flight -已发起但尚未完成的 write RPCs 的直接1/0
（对应于阻塞1O）。

- pending write
pages - OSC上1/O 队列中挂起的写页面数。

- pending read pages - OSC上1/O队列中挂起的读页面数。
下面列出了上表中统计数据各条目的含义，各行显示了读取或写入次数（ios）、占
总读取或写入的相对百分比（%）以及至该点为止的累积百分比（cum%）。
条目
说明
pages per RPC 按照RPC 中的页数显示累积的 RPC读取和写入。例如，单页 RPC的数
据将显示在0：行。
RPCs in flight
显示发送 RPC时挂起的RPC数。第一个 RPC发送后，0：行将递增。如
果在另一个 RPC挂起时发送第一个 RPC，则1：行将递增。依此类推。
offset
RPC 读取或写入对象的第一页的页面索引。
分析：
此表提供了一种将 RPC流的并发性可视化的方法。在理想情况下，您会看到很多
值聚集在max_rpcs_in_£1ight值周围，这表明网络一直处于忙碌状态。
有关客户端I/O RPC流优化的相关信息，请参见本章第4.1 节"客户端1/O RPC流的
调试"。

### 39.3.2. 客户端活动监控

stats文件负责维护在 Lustre 文件系统的 VFS接口上的客户端的典型操作期间累
积的统计信息。文件中仅显示非零参数。
默认启用客户端统计信息功能。
注意
所有挂载文件系统的统计信息可通过输入以下命令得到：
1 lct1 get_param 11ite.*.stats
示例：
1 client# lct1 get_param 11ite.*.stats
2 snapshot_time

### 1308343279.169704 secs.usecs

3 dirty_pages_hits
14819716 samples ［regs］
4 dirty pages misses
81473472 samples ［regs］
5 read bytes
36502963 samples ［bytes］
1 26843582 55488794

6 write_bytes
7 brw_read
8 ioct1
9 open
10 close
11 seek
12 Esync
13 truncate
14 setxattr
I5 getxattr
22985001 samples ［bytes］ 0 125912 3379002
2279 samples ［pages］ 1 1 2270
186749 samples ［regs］
3304805 samples ［regs］
3331323 samples ［regs］
48222475 samples ［regs］
963 samples ［regs］
9073 samples ［regs］
19059 samples ［regs］
61169 samples ［regs］
可以通过将空字符串回显到stats文件中或使用以下命令来清除统计信息：
1 lct1 set_param 11ite.*.stats=0
下表介绍了所显示统计信息的详细内容：
条目
说明
snapshot_time
dirty_page_hits
dirty_page_misses
read_bytes
write_bytes
brw_read
读取stats文件的 UNIX epoch 瞬间。
满足脏页面缓存的写入操作数。有关 Lustre 文件系统中脏缓存行
的更多信息，请参见本章第4.1节"客户端I/ORPC流的调试”。
不满足脏页面缓的写入操作数。
已发生的读操作数。将显示三个附加参数：
min 一自计数器重置以来单个请求读取的最小字节数；
max 一自计数器重置以来单个请求读取的最大字节数；
sum 一自计数器重置以来所有读请求的累计字节数。
已发生的写操作数。将显示三个附加参数：
min 一自计数器重置以来单个请求写入的最小字节数；
max 一自计数器重置以来在单个请求写入的最大字节数；
sum 一自计数器重置以来所有写请求的累计字节数。
已读取的页数。将显示三个附加参数：
min 一自计数器重置以来，单个brw读请求中读取的最小字节数；
max 一自计数器重置以来，单个brw读请求中读取的最大字节数；
sum 一自计数器重置以来，所有brw读请求中累计字节数。

条目
ioct1
open
close
seek
fsync
truncate
setxattr
getxattr
说明
组合文件和目录ioct1操作的数量。
已成功的打开操作数量。
已成功的关闭操作数量。
调用 seek 的次数。
调用 Esync 的次数。
调用有锁和无锁truncate的总数。
已设置扩展属性的次数。
已调取扩展属性值的次数。
分析：
提供客户端上正在进行的1/O 活动的数量和类型有关信息。

### 39.3.3.客户端读写位移统计信息监控

设置offset_stats参数后，在访问下一个顺位前，将对进程的一系列读取或写入
调用信息进行维护。每当读取或写入不同的文件时，OFFSET字段将被重置 0。
注意
默认情况下，为减少监控开销，非必要的话统计信息不会被收集在 offset_stats、
extents_stats和extents_stats_per_process文件中。可通过在任何一个文件
中写入除0和"disable" 以外的任何内容来激活这三个文件的统计信息收集功能。
示例：
1 # lct1 get_param 11ite.testfs-f57dee0.offset_stats
2 snapshot_ time: 1155748884.591028 （secs.usecs）
4 R/N
5R
6R
7 W
8 W
9 W
10 R
RANGE
RANGE
SMALLEST
LARGEST
PID
START
END
EXTENT
EXTENI
OFFSET

在上述示例中，snapshot_time 是读取文件时的 UNIX epoch 瞬间。显示的表格
内容介绍如下：
offset_stats 文件可通过以下命令进行清除：
1 lct1 set_param llite.*.offset_stats=0
条目
说明
R/W
指示非顺序调用是读取还是写入。
PID
调用读/写操作的进程 ID。
RANGE START/RANGE END
顺序读/写调用的范围。
SMALLEST EXTENT
相应范围内的最小的单次读/写（以字节为单位）。
LARGEST EXTENT
相应范围内的最大的单次读/写（以字节为单位）。
OFFSET
前一个范围结束点和当前范围开始点之间的差距。
分析：
此数据提供了数据连续或分段的信息。例如，上面示例中的第四个条目显示了此
RPC 的写入在100到1110 范围内时顺序的，并且最小写入10个字节，最大写入500个
字节。该范围开始于从前一个条目的 RANGE END 位移-150处。

### 39.3.4.客户端读写范围统计信息监控

要进行深入的故障排除，可以通过查看客户端读写扩展统计信息来获取针对文件系
统或特定进程的详细的I/O 范围信息。
注意
默认情况下，为减少监控开销，非必要的话统计信息不会被收集在 offset_stats、
extents_stats和 extents_stats_per_process 文件中。可通过在任何一个文件
中写入除0和"disable" 以外的任何内容来激活这三个文件的统计信息收集功能。

### 39.3.4.1.基于客户端的1/0 范围大小调查 11ite 目录中的 extents_stats 直方图

显示了读写 1/O 范围大小的统计信息。此文件不对每个进程的统计信息进行维护。
示例：

```bash
1 # lctl get param 1lite.testfs-*.extents
```
_stats
2 snapshot_time：

### 1213928728.348516 （secs.usecs）

read
一
write
4 extents
calls oe
cume
一
callsde
cums

6 OK - 4K：
7 4K - 8K：
8 8K - 16K：
9 16K - 32K：
10 32K - 64K：
11 64K - 128K：
12 128K - 256K：
13 256K - 512K：
14 512K - 1024K：
15 IM - 2M：
|
|
在这个例子中，snapshot_time是读取文件时的UNIX epoch 瞬间。该表显示了
根据大小排列的累计范围，并分别为读取和写入提供了统计信息。表中的每一行分别显
示读取和写入的RPC数（calls），，占总调用的相对百分比（8）以及到该点止所占
的累积百分比（cum8）。
此文件可通过以下命令进行清除：

```bash
1 # lctl set_param 1lite.testfs-*.extents_stats=1
```

### 39.3.4.2. 基于进程的客户端1/O统计信息 extents_stats_per_process文件用于

维护基于每个进程的 I/O 范围大小统计信息。
示例：

```bash
1 # lctl get_param llite.testfs-*.extents_stats_per_process
```
2 snapshot_time：

### 1213928762.204440 （secs.usecs）

4 extents
calls
read
op
write
cums
一
calls oe
6 PID:11488
OK - 4K：
4K - 8K：
8K - 16K：
16K - 32K：
32K - 64K：
64K - 128K：
128K - 256K：
256K - 512K：
|
cum%

512K - 1024K：
IM - 2M：
18 PID:11491
OK - 4K：
4K- 8K：
8K - 16K：
16K - 32K：
24 PID: 11424
OK-4K：
4K - 8K：
8K - 16K：
16K- 32K：
32K - 64K：
64K - 128K：
一
一
|
32 PID: 11426
OK - 4K：
35 PID: 11429
OK - 4K：
-
I
该表显示了根据每个进程大小排列的累计范围，并分别为读取和写入提供了统计信
息。表中的每一行分别显示读取和写入的RPC数（cal1s），占总调用的相对百分比（8）
以及到该点为止所占的累积百分比（cumg）。#料# 39.3.5. OST 阻塞1/O 流监控
在osd-ldiskfs或osd-zfs目录下的brw_stats参数文件包含直方图数据，该图
显示了发送到磁盘的1/O请求的数量、大小、以及它们在磁盘上是否连续的统计信息。
示例：
在OSS或MDS上输入：

```bash
1 # oss# lctl get_param osd-*，*.brw_stats
```
2 snapshot_time：

### 1372775039.769045 （secs.usecs）

4 pages per bulk r/w
5 1：
62：
read
write
rpcs oe cum se一
rpCs
ae cum de
108 100 100
||
0〇
0 100
一

74：
8 8：
9 16：
10 32：
11 64：
12 128：
13 256：
16 discontiguous pages
17 0：
20 discontiguous blocks
21 0：
22 1：
25 disk fragmented I/0s
26 0：
27 1：
28 2：
31 disk I/0s in flight
32 1：
33 2：
34 3：
35 4：
36 5：
37 6：
38 7：
39 8：
40 9：
0 100
0 100
0 100
0 100
0 100
0 100
0 100
一
一
一
一
| 23142 99 100
read
write
rpcs oe cum oe | rpcs ae cum oe
108 100 100
| 23245 100 100
read
write
rpcs o cum oe |
rpcs 8 cum a
108 100 100
| 23243 99 99
00100||
0 100
read
ios 8 cum a |
94 87 87
14 12 100
write
ios oe cum o
0〇
| 23243 99 99
0 100
read
ios ae cum ae |
14 100 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
write
ios
o cum dp
| 20896 89 89
0 99
0 99
|
一
0 99
0 100
read
一
write

43 I/0 time （1/1000s）
44 1：
45 2：
46 4：
47 8：
48 16：
49 32：
50 64：
S1 128：

```bash
$2 256：
```
53 512：
54 IK：
55 2K：
S6 AK：
S7 8K：
60 disk I/0 size
61 4K：
62 8K：
63 I6K：
64 32K：
65 64K：
66 128K：
67 256K：
68 512K：
69 IM：
ios o cum d |
94 87 87
0 87
14 12 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
0 100
ios
| 18979 81
ae cum oe
0。
7 99
0 99
0 100
read
ios oe cum oe |
14 100 100
0 100
一
一
一
write
ios
a cum o
0 100
0 100
0 100
0 100
0 100
一 2400
0 100 | 23142 99 100
下面列出了上表中统计数据各条目的含义，各行显示了读取或写入次数（ios）、占
总读取或写入的相对百分比（%）以及至该点为止的累积百分比（cum%）。
条目
说明
pages per bulk r/w
discontiguous pages
discontiguous blocks
每个 RPC 请求的页数，应与客户端rpc_stats匹配（请参
见本章第3.1 节"客户端 RPC流监控"）。
单个 RPC 中每个页面的文件逻辑偏移量中的不连续数。
单个RPC中文件系统物理块分配的不连续数。

条目
说明
disk fragmented I/0s 未完全按顺序写入的1/O 数。
disk I/0s in flight
当前挂起的磁盘 T/O数。
I/0 time （1/1000s）
完成每个 IO 操作所需时间。
disk I/0 size
每个 IO 操作的大小。
分析：
此数据提供了文件系统中的范围大小和分布的相关信息。

### 39.4. Lustre 文件系统1/0调试

每个OSC 都有自己的可调参数树。例如：

```bash
1 $ lct1 lctl list_param osc.*.*
```
2 osc.myth-OST0000-osc-Efff8804296c2800.active
3 osc.myth-OST0000-osc-ffff8804296c2800.blocksize
4 osc.myth-OST0000-osc-ffff8804296c2800.checksum_dump
5 osc.myth-OST0000-osc-ffff8804296c2800.checksum_type
6 osc.myth-OST0000-osc-ffff8804296c2800.checksums
7 osc.myth-OST0000-osc-ffff8804296c2800.connect_flags
8：
9：
10 osc.myth-OST0000-osc-ffff8804296c2800.state
11 osc.myth-OST0000-osc-ffff8804296c2800.stats
12 osc.myth-OST0000-osc-ffff8804296c2800.timeouts
13 osc.myth-OST0000-osc-ffff8804296c2800.unstable_stats
14 osc.myth-OST0000-osc-ffff8804296c2800.uuid
15 osc.myth-OST0001-0sc-ffff8804296c2800.active
16 osc.myth-OST0001-osc-ffff8804296c2800.blocksize
17 osc.myth-OST0001-osc-ffff8804296c2800.checksum_dump
18 osc.myth-OST0001-osc-ffff8804296c2800.checksum type
19：
20：
下面介绍了一些 Lustre 文件系统的可调参数。


### 39.4.1.客户端1/O RPC流的调试

在理想情况下，每个I/O RPC 会将刚好数据量大小刚好的数据打包，且每时每刻都
会有数量一致的已发起RPC在处理中。为优化客户端1/O RPC流，Lustre 提供了几个可
调参数以根据网络条件和集群大小来调整行为。相关内容请参见本章第3.1节"客户端
RPC 流监控"。
RPC 流可调参数包括：

- osc.osc_instance.cksums 一用于控制客户端是否计算传输到OST的批量数
据的数据完整性校验和。默认情况下，启用数据完整性校验和。使用的算法可以
通过 checksum_type 参数来设置。

- osc.osc_instance.cksum_type 一用于控制客户端使用的数据完整性校验和
算法。可用的算法是由算法集决定的。默认使用的校验和算法是通过首先选择
OST上可用的最快的一些算法，然后在客户端上选择这些算法中最快的算法，这
依赖于 CPU硬件和内核中的可用优化。默认的算法可以通过在checksum_type
参数中写入算法名称来设置。通过读取 checksum_type参数可以在客户端上看
到可用的校验和类型。目前支持的校验和类型有：adler, crc32, crc32c。在
Lustre 2.12 版本中，增加了额外的校验和类型，允许与T10-PI 功能的硬件进行
端到端的校验和集成。客户端将根据存储所使用的校验和类型，为RPC校验和
计算出适当的校验和类型，由服务器验证并传递给存储。T10-PI 校验和类型有：
t10ip512,t10ip4K,t10crc512,t10crc4K。
osc.*osc
_instance*.max_dirty_mb -用于控制OSC 中允许写入客户端页
缓存中的脏数据量。达到限额时，先前缓存的写入同步到服务器前其他写入将停
止。此限额可通过1ct1 set_param命令修改，其值必须在0到2048MiB 之间或
等于1/4的RAM。当客户端不能在每个 OSC中聚合足够的数据以形成一个完整的
RPC 参数（由max_pages_per_rpc 设置）时，如果您没有使用较大的写入，性能可
能会明显受损。
为使性能最优化，我们推荐您将 max_dirty_mb 设置力max_pages_per_rpc*
max_rpcs_in_flight的四倍。

- osc.*osc_instance*.cur_dirty bytes -只读值，返回此OSC上当前写
入和缓存的字节数。

- osc.*osc_instance*.max_pages_per_rpc-对OST 的单个 RPC 1/O的
最大页数。最小值为1页，最大值为 16MiB（对于PAGE_SIZE为 4KB 的
系统 4096页），RPC 的默认最大值为4MiB。上限也可能受到 OSS 上
的ofd.*.brw_size设置的限制，适用于连接到该OSS 的所有客户端。也可指定

单位后缀（如max_pages_per_rPc=4M）以便独立于客户端的PAGE_SIZE而单
独指定 RPC的大小。

- osc.*osc_instance*.max_rpcs_in_f1ight - OSC 到其OST 的 RPC 的最
大并发处理数。如果OSC尝试启动 RPC但发现已经有与此设置数相同数量的未
完成 RPC，它将等待发起 RPC，直到某些 RPC完成。最小值为1，最大值为256。
默认值力8RPC.
为提升小文件I/O 性能，请提高 max_rpcs_in_flight 值。

- 11ite.*fsname-instance*/max_cached_mb -客户端缓存的最大 read
+write 数据量（默认力 RAM 的1/2）。
注意
osc_instance和fsname_instance的值对于每个挂载点来说都是唯一的，以便
于将 osc、mdc、lov、Imv 和 llite 参数与同一挂载点关联。但是，脚本通常会使用通配符

- *或文件系统专用的通配符 fsname-*来统一指定所有客户端上的参数设置。比如说
1 1ct1 get_param osc.testfs-OST0000-osc-ffff88107412f400.rpc_stats
2 osc.testfs-OST0000-osc-ffff88107412f400.rpc_stats-
3 snapshot_time：

### 1375743284.337839 （secs.usecs）

4 read RPCs in flight: 0
5 write RPCs in flight: 0

### 39.4.2. 文件 Readahead 和目录Statahead 的调试

文件预读和目录 statahead 能够在进程请求数据之前将数据读入内存。文
件预读为read（）相关的调用将文件内容数据预读取到内存中，而目录 statahead
readdir（）和stat（）相关的调用将文件元数据取到内存中。当readahead 和 statahead
工作良好时，访问数据的进程会发现，其所需要的信息可以立刻在客户端的内存中得
到，而无需忍受网络I/O 的延迟。

### 39.4.2.1. 文件 Readahead 当应用程序的两次或多次连续读取未能命中 Linux 缓冲区缓

存中的数据时，就会触发文件 readahead。首次readahead 的大小由 RPC大小和文件条带
大小决定，通常至少为 1MiB。后续的预读尺寸会保持线性增长，直到预读缓存到达了
客户端上每个文件或每个系统的上限。
Readahead 相关可调参数有：

- 11ite.fsname-instance.max_read_ahead_mb -用于控制所有文件预读
的最大数据量。在文件描述符上第二次顺序读取之后，预读文件至 RPC大小的块

（4MiB或更大的read（）大小）中。随机读取的大小只能为read（）调用大小（无
预读）。读取文件至非连续区域会重置预读算法，并且在再次顺序读取之前不会再
次触发预读。
这是对所有文件的全局限制，不能大于客户端RAM 的1/2。要禁用 readahead，请
设置max_read
_ahead_mb=0。

- 11ite.fsname_instance.max_read_ahead_per_file_mb-当获取到一
个文件上的读取顺序时，用于控制客户端应该预读取的最大数据兆字节数
（MiB）。这是每文件的预读取限制，不能大于max_read_ahead_mb。

- 11ite.fsname-instance.max_read
Lahead_whole_mb -用于控制最多多
大的文件会在被读到时被整个预取到客户端，不管read（）调用读取的大小有多
大，单位为 MiB。这样的整体预取，可以避免浪费多个小RPC 来读取相对较小的
文件，因为在整个文件读取完之前，系统没有办法有效地检测到连续读取模式。
默认值为2MiB 或一个 RPC的大小（由max_pages_per_rpc 决定），取两者中的
较大者。。

### 39.4.2.2. 目录 Statahead 和 AGL 的调试 许多系统命令（如1s -1、du和Eind）按顺

序遍历目录。为使这些命令高效运行，可以启用目录 statahead 来提高目录遍历性能。
statahead 相关可调参数有：

- statahead_max 一用于控制由 statahead 线程预取的最大文件属性数量。statahead
默认启用，statahead_max默认为32个文件。
禁用 statahead，请在客户端上设置=statahead.
_maxO：

```bash
lctl set_param 11ite.*.statahead_max=0
```
在客户端上更改最大 statahead 窗口大小：
lct1 set_param 1lite.*.statahead_max=n
最大statahead_max 为8192个文件。
目录 statahead 线程同时也会从 OST 预取文件大小和消耗的空间，以便应用程序需
要时，可以直接从客户端上获取所有的文件属性。这是由异步 glimpse 锁（AGL）设置
控制，可通过以下命令禁用 AGL 行次：
lct1 set_param 1lite.*.statahead_ag1=0

- statahead_stats -只读接口，可提供当前 statahead 和 AGL 统计信息，如自
上次挂载以来已触发 statahead/AGL 的次数、由于预测错误或其他原因导致的
statahead/AGL 故障次数等。

注意
AGL 处理的 inode 是由 statahead线程构建的，AGL 行为因此受 statahead 的影响。
如果禁用了 statahead，则 AGL 也会被禁用。

### 39.4.3.服务器读缓存的调试

服务器读缓存功能是指在 OSS 或MDS 上提供文件数据（Data-on-MDT）的只读缓
存，通过Linux 页面缓存来存储数据。它会使用分配的所有物理内存。
服务器读缓存可在以下情况提高Lustre 文件系统性能：

- 许多客户端访问相同的数据集（如在HPC应用程序中或无盘客户端从 Lustre 文件
系统引导时）。

- 一个客户端正在写入数据，而另一个客户端正在读取数据（即客户端通过文件系
统交换数据）。

- 客户端自身的缓存非常有限。
服务器读缓存提供了以下好处：

- 允许服务器更频繁地缓存读取数据。

- 改进重复读取以匹配网络速度而不是存储速度。

- 提供构建服务器写缓存（小数据写入聚合）的块。

### 39.4.3.1.服务器读缓存的使用 服务器读缓存是在OSS 和MDS上实现的，不需要客户

端的任何特殊支持。由于服务器读缓存使用了 Linux 页面缓存中的可用内存，因此应根
据1/O模式来确定适当的缓存内存量。如果主要是读取数据，则服务器需要比主要为写
入的1/0 模式需要更多读缓存。
可使用以下可调参数管理服务器读缓存。许多参数对osd-1diskfs和osd-zfs均
可用，但在某些情况下，osd-zfs的实现方式使参数无法使用。

- read_cache_enable -用于总体控制在读取请求期间从磁盘读取的数据是否保
留在内存，以便于应付随后对相同数据的读取请求而无需从磁盘重新读取。默认
情况下对 HDD OSDs为启用状态 （read_cache_enable=1），对闪存OSD力自
动禁用状态（nonrotationa1=1）。
当OSS 收到来自客户端的读取请求时，会从磁盘上读取数据到其内存中，并将数
据作为请求的回复发送。如果读取缓存启用，那么在满足客户端的请求后，这些数据会

留在内存中。当收到相同数据的后续读取请求时，OSS会跳过从磁盘读取数据，而直接
从缓存的数据中满足请求。这些读缓存由 Linux 内核在该OSS 的所有OST上进行全局
管理，这样当空闲内存不足时，最近使用最少的缓存页会从内存中删除。
如果禁用读缓存，在完成了对客户端的读取请求的服务后，OSS会丢弃数据，对后
续的读取请求，OSS 会再次从磁盘读取数据。
在服务器的所有目标上禁用读缓存，请运行：
oss1# 1ct1 set_param osd-*.*.read_cache_enable=0
重新在目标上后用读缓存，请运行：
oss1# lct1 set_param osd-*. ｛target_name｝.read
_cache_enable=1
查看服务器的所有目标上都启用了读缓存，请运行：
OSS1#

```bash
lctl get_param
```
osd-*.*.read_cache_enable

- writethrough_cache_enable 一用于总体控制发送到服务端的写入请求数
据是保留在读缓存用于后续读取，还是在写入完成后丢弃。默认情况下对HDD
OSD 为启用状态（writethrough_cache_enable=1），对闪存OSD为自动禁
用（nonrotational=1）。对osd-zfs来说，写缓存不能被禁用，因此禁用参数
对该后端不可用。
当服务端从客户端接获取请求时，则将从客户端接收数据放入内存中并写入存储。
如果目标启用了写缓存，且RPC和对象大小也满足下述的其他标准后，则此数据在写
入请求完成后将留存在内存中。如果后续收到对相同数据的读取请求或修改部分页面的
写入请求，且数据仍在内存中时，服务端会跳过从存储读取此数据的步骤。
如果禁用了写缓存（writethrough_cache_enabled=0），或者写区域或对象足
够大以至于缓存失去作用，则服务端在完成客户端的写入请求后丢弃数据。处理后续读
取请求或部分页面写入请求时，服务端必须从磁盘重新读取数据。
当客户端正在执行小数据写入或会导致部分页面更新的未对齐写入，或者其他节点
需要立即读取另一个节点刚写入的文件时，建议启用写缓存。例如，在生产者-消费者
1/O模型中，或者在未进行4096字节边界对齐的共享文件写入等情况下，启用写缓存可
能会非常有用。
相反，当大部分1/O 为文件写入且在短时间内不会被重新读取，或者文件仅由同一
节点写入和重新读取时，无论1/0是否对齐，都建议禁用写缓存。
要在服务端的所有目标上禁用写缓存，请运行：

```bash
oss1# lctl set_param osd-*.*.writethrough_cache_enable=0
```
重新在 OST 上后用写缓存，请运行：
oss1# 1ct1 set_param osd-*.｛OST_name｝.writethrough_cache_enable=1
查看是否启用了写缓存，请运行：
oss1# 1ct1 get_param osd-*.*.writethrough_cache_enable


- readcache_max_filesize -用于控制read_cache和writethrough_cache尝
试保留在内存中的对象的最大大小。大于readcache_max_filesize的
对象，无论进行读取或写入，无论是否设置
了writethrough_cache_enable或read_cache_enable，都不会保存
在缓存中。
设置该参数对于下面这种工作负载非常有用：相对较小的文件（比如工作启动文件、
可执行文件、日志文件等）被许多客户端重复访问，而大文件通常只被读或写一次。不
把大文件放入缓存，就意味着更多较小的对象有更大概率能在缓存中保留更长的时间。
设置readcache_max_filesize时，输入值可以以字节为单位指定，也可以使用
后缀来指示其他二进制单位（如K（千字节）、M（兆字节）、G（千兆字节）、T（太字
节）、P（千兆字节））。
在服务端所有的目标上将最大缓存对象大小限制为 64 MB，请运行：
oss1# lct1 set_param osd-*.*.readcache_max_filesize=64M
在所有目标上禁用最大缓存对象大小的限制，请运行：
oss1# lct1 set_param osd-*.*.readcache_max_filesize=-1
查看是否服务端所有的目标上都启用了当前最大缓存目标大小的限制，请运行：
os31# lct1 get_param osd-*.*.readcache_max_filesize

- readcache_max_io_mb -控制能够缓存在内存中的单个读操作的最大大小。大
于readcache_max_io_mb的读取将直接从存储中读取，完全绕过页面缓存，从
而避免了在高10 率下CPU 的大量开销。osd-zfs中无法禁用读缓存，因此这个
参数对该后端不可用。
当设置readcache_max_1o_mb时，输入值可以以 mebibytes 为单位来指定，也可
以用后缀来表示其他二进制单位，如K （kibibytes），M （mebibytes），G （gibibytes），T
（tebibytes），或P（pebibytes）。

- writethrough_max_io_mb -控制能够缓存在内存中的单个写操作的最大大小。
大于writeethrough_max_io_mb的写入将直接写入存储，完全绕过页面缓存，
从而避免了在高IO 率下CPU 的大量开销。osd-zfs中无法禁用写缓存，因此这
个参数对该后端不可用。
当设置writeethrough_max_io_mb时，输入值可以以 mebibytes 为单位来指定，
也可以用后缀来表示其他二进制单位，如K （kibibytes）、M （mebibytes）、G （gibibytes）、
T （tebibytes） 或 P （pebibytes）。


### 39.4.4. 启用OSS 异步日志提交

OSS 异步日志提交功能将数据异步地写入磁盘，而不强制进行日志刷新。这将减少
搜索次数，并显著提高了某些硬件的性能。
注意
异步日志提交无法用于 Direct 1/0 的写入（设置了O_DIRECT标志）。对这种10，将
强制执行日志刷新。
启用异步日志提交功能后，客户端节点会将数据保留在页面缓存中（增加页
面引用）。Lustre 客户端将监视从 OSS发送到客户端的消息中的最后提交的交易号
（Transaction Number, transno）。当客户端看到OSS报告的最后一个提交的transno至
少等于批量写入的transno时，它会在相应的页面上释放引用。为了避免批量写入后，
持有页面引用对时间过长，客户端在收到批量写入的回复后将发起7秒的 ping 请求
（OSS 文件系统提交默认时间间隔为5秒），以便OSS 报告最后提交的transno。
如果 OSS 在日志提交之前崩溃，则中间数据将丢失。但是，结合异步日志提交的
OSS 恢复功能能够使客户端重放其写入请求，并通过恢复文件系统的状态来补偿丢失的
磁盘更新。
默认情况下，sync_journa1为启用状态（sync_journa1=1），以便同步提交日
记条目。启用异步日志提交，请输入以下内容将sync_journal参数设置为0：

```bash
1 $ lctl set_param obdfilter.*.sync_journal=0
```
2 odfilter.101-0ST0001.sync_journal=0
sync-on-lock-cancel 解决下面场景下的数据一致性问题：在多个客户端向一个对象
的交叉区域写入数据后，如果这个 OSS崩溃，而且不巧其中一个客户端也崩溃了，这
种情况就有可能会违反 POSIX 对连续写入的语义要求，而且数据可能遭受损坏。在启
用了 sync-on-lock-cancel 功能后，如果被取消的锁上附加了任何易失性的写入，OSS会
在撤销锁时同步将文件系统日志写到磁盘。禁用锁取消同步日志功能可以提高并发写的
性能，但不推荐禁用这一功能。
sync_on_1ock_cancel参数可设置为以下值：：

- always 一在锁取消时强制执行日志更新（async_journa1启用时的默认值）。

- blocking一只在因阻塞回调引起的锁取消时强制执行日志更新。

- never -不强制执行任何日志更新（async_journa1禁用时的默认值）。
例如，将 sync_on_1ock_cance1设置为不强制执行日志更新，使用以下类似命
令：
I $ 1ct1 get_param obdfilter.*.sync_on_1ock_cancel
2 obdfilter.1o1-0ST0001.sync_on_lock_cancel=never


### 39.4.5.客户端元数据RPC流的调试

客户端元数据 RPC流表示客户端并行发起的到 MIDT 目标的元数据RPC。元数据
RPC 可以分为两类：不更改文件系统的请求（如 getattr 操作）和更改文件系统的请求
（如 create、unlink、setattr 操作）。为优化客户端元数据 RPC流，Lustre 提供了几个可调
参数来根据网络条件和集群大小调整行为。
请注意，增加并行发起的元数据RPC 的数量可能会改善元数据密集型并行应用程
序的性能，但会在客户端和 MDS上消耗更多的内存。
（在Lustre 2.8中引入）

### 39.4.5.1. 配置客户端元数据RPC 流

MIDC 的max_rpcs_in_flight 参数定义了客
户端并行发送到 MIDT 目标的元数据 RPC的最大数量，包括更改和不更改文件系统的
RPC。这包含了所有文件系统元数据操作，如文件或目录统计、创建、取消链接等。其
默认值次8，最小值为1，最大值 256。
在Lustre 客户端上运行以下命令设置 max_rpcs_in_f1ight 参数：
1 clients lct1 set_param mdc.*.max.
_rpcs_in_flight=16
MDC 的max_mod
_rpcs_in_flight 参数定义了客户端并行发送到MDT 目标的
更改文件系统的RPC 的最大数量。例如，Lustre 客户端在执行文件或目录创建、取消链
接、访问权限修改、所有权修改时会发送更改式 RPC。其默认值为7，最小值为1，最
大值 256。
在Lustre 客户端上运行以下命令设置max_mod_rpcs_in_f1ight 参数：
1 clients lct1 set_param mdc.*.max_mod_rpcs_in_flight=12
_mod_rpcs_in_flight值必须比max_rpcs_in_f1ight 值小，同时也必须
小于或等于 MDT的max_mod_rpcs_per_client 值。如果未满足其中一个条件，设
置将失败，并在 Lustre 日志中写入明确的错误消息。
MDT 的 max_mod_rpcs_per_client参数是内核模块mdt的可调参数，它定义
了每个客户端所允许的处理中的最大更改式 RPC 数量。该参数可以在运行时进行更新，
但此更改仅对新客户端连接有效。其默认值为8。
在 MDS上运行以下命令设置 max_mod_rpcs_per_client 参数：
1 mds$ echo 12 > /sys/module/mdt/parameters/max_mod_rpcs_per_client

### 39.4.5.2. 客户端元数据 RPC流监控 rpc_stats 文件包含了显示更改式 RPC相关信

息的直方图，可用于确定应用程序执行更改文件系统的元数据操作时所实现的并行级
别。
示例：

1 clients lct1 get._param mdc.*.rpc_stats
2 snapshot._tine：

### 1441876896.567070 （secs.usecs）

3 modify_RPCs_in_flight: 0
6 rpcs in flight
70：
8 1：
modify
rpcs 8 cum de
9 2：
10 3：
=1 4
12 5：
13 6：
14 7：
15 8：
16 9：
17 10：
18 11：
19 12：
3624 15 23
6482 27 50
7321 30 81
4540 18 100
文件内容包括：

- snapshot_time 一读取文件时的UNIX epoch 瞬间。

- modifY_RPCs_in_flight - MDC发起但当前还未完成的更改式 RPC数。该
值必须永远小于或等于max_mod_rpcs_in_flight。

- rpcs in flight 一发送RPC 时当前挂起的更改式 RPC 数量，包括相对百分比
（%） 和累积百分比（cum g）。
如果大部分更改式元数据RPC 在发送时已经有大量的接
近max_mod_rpcs_in_f1ight值的挂起元数据RPC，则意味着可以增
加max_mod_rpcs_in_f1ight值来提高元数据更改性能。

### 39.5. Lustre 文件系统超时配置

在Lustre 文件系统中，RPC 超时使用自适应超时机制（默认启用）。服务端跟踪
RPC 完成时间并向客户端报告，以便估计未来 RPC 的完成时间。客户端使用这些估计
值来设置 RPC 超时值。当服务器请求处理因某种原因而减慢时，服务器 RPC完成时间
延长，客户端则随之修改 RPC 超时值以允许更多的时间来完成 RPC。

如果服务器上排队的 RPC接近客户端指定的RPC超时，为避免 RPC超时和断开和
重新连接的循环，服务器会向客户端发送"早期回复"，告知客户端以允许更多的处理时
间。相反，随着服务器处理速度的加快，RPC超时值会降低，从而能够更快地检测到服
务器无响应、更快地连接到服务器的故障转移伙伴。

### 39.5.1. 配置自适应超时

下表中的自适应超时参数可以使用 MGS上的1ct1 conf_param命令在系统
范围内进行永久设置。例如，为与文件系统testfs关联的所有服务器和客户端设
置at_max值：
1 lct1 conf_param testfs.sys.at_max=1500
注意
访问多个 Lustre 文件系统的客户端必须对所有文件系统使用相同的参数值。
参数
at_min
at_max
at_history
at_early_margin
at_extra
说明
自适应超时的最小值（以秒为单位），即服务器会报告的最小处理
时间。默认值为0。理想情况下，应将其设置默认值。客户端不
直接使用此值但将基于此值来设置超时时间。如果由于未知原因
（通常为临时网络中断）导致自适应超时值太小而客户端处理 RPC
超时，可增大at_min值。
自适应超时的最大值（以秒为单位），是服务估计时间的上限。如
果达到 at_max，RPC 请求超时。将at_max 设置为0则表明禁用
自适应超时，转而采用固定超时时间设置方法。注意，如果慢速硬
件导致服务估计值增加直至超出默认值at_max，可将at_max增加
到您愿意等待RPC完成的最长时间。
自适应超时记忆的发生最慢事件的时间段（以秒为单位）。默认值
为600。
超过该时间，Lustre 服务器将发送早期回复（以秒为单位）。默认
值 5。
服务器发送每次早期回复时请求的时间增量（以秒为单位）。服务
器不知道 RPC还需花费多少时间，因此会要求一个固定的值，默认
30。该默认值在发送过多早期回复和高估实际完成时间之间寻求

参数
说明
了一个平衡。当服务器发现排队请求即将超时并需要发送早期回复
时，服务器会加大at_extra值。如果超时，Lustre 服务器将丢弃
请求，客户端进入恢复状态并重新连接到正常状态。如果同一RPC
发生了多个要求增加30秒的早期回复，请将at_extra值更改为
一个较大的数字以减少早期回复的发送，从而减少网络负载。
1d1m_enqueue_min
最小锁入队时间（以秒为单位），默认值为100。锁入队所需的时
间1d1m_enqueue通过入队估计所需时间的最大值（受at_min和
at_max参数影响）乘以加权因子和1d1m_enqueue_min计算所
得。测量所得的入队时间增加时，锁入队的时间增加（类似于自
适应超时）。

### 39.5.1.1. 解析自适应超时信息 自适应超时信息可在每个服务器上使用命

令lct1 get_param fost,mds）.*.*.timeouts和在客户端上使用命令1ct1
get_param 1osc,mdc｝.*.timeouts获取。从timeouts 中读取信息，请输入：

```bash
1 # lctl get_param -n ost.*.ost_
```
_1o.timeouts
2 service : cur 33 worst 34 （at 1193427052, 0d0h26m40s ago） 1 1 33 2
在此示例中，此节点上的ost_主o服务报告了 RPC 服务时间估计为33秒。最长的
RPC 服务时间发生在26分钟前，为34秒。
该输出还提供了服务时间的历史记录，显示了四个自适应超时历史记录，分别报告
了其最大的 RPC 时间。在0-150s bin 和150-300s bin 中，最大的RPC 时间为1。300-450s
bin 中，最大 RPC时间为33秒。450-600s bin 中，最大 RPC 时间为2秒。估计的服务时
间则取这四条记录中的最大值（在本例中为33秒）。
客户端OBD 也跟踪服务时间（由服务器报告），如下例所示：
1 # lct1 get_param osc. *.timeouts
2 last reply:1193428639, 0d0h00m00s ago
3 network
：cur 1 worst 2 （at 1193427053, 0d0h26m26s ago） 1 1 1 1
4 portal 6 :cur 33 worst 34 （at 1193427052, 0d0h26m27s ago）
33 33 33 2
5 portal 28
：cur 1 worst 1 （at 1193426141, 0d0h41m39s ago）
111 1
6 portal 7 :cur 1 worst 1 （at 1193426141, 0d0h41m39s ago）
101 1
7 portal 17 ：cur 1 worst 1 （at 1193426177, 0d0h41m02s ago）

在此示例中，portal 6（ost_io服务入口）显示了该入口报告的服务时间估计历史
记录。
服务器统计文件还显示了估计值的范围，包括 min、max、sum 和 sumsq。例如：

```bash
1 # lctl get_param mdt.*.mdt.stats
```
2..
3 req_timeout
4….
6 samples ［sec］ 1 10 15 105

### 39.5.2. 设置静态超时

Lustre 超时。
在未启用自适应超时时使用，Lustre 软件提供两组静态（固定）超时：LND超时和

- LND timeouts- LND 超时可确保网络中的点对点通信在出现故障（如程序包丢失
或连接断开）时在有限时间内完成。每个 LND 有单独的LND 超时参数设置。
设置S_LND标志记录LND 超时。它们不通过控制台打印消息，请查看 Lustre 日志
中的D_NETERROR消息，或使用以下命令将D_NETERROR消息打印到控制台：

```bash
lctl set_param
```
printk=tneterror
拥塞的路由器可能造成LND 假性超时。为避免这种情况，请增加 LNet 路由器缓冲
区的数量来减少背压，或增加网络上所有节点的LND 超时。同时，也可考虑增加系统
中LNet路由器节点总数，从而使路由器总带宽与服务器总带宽相匹配。

- Lustre timcouts -在未启用自适应超时时，Lustre 超时可确保 RPC 出现故障时在
有限时间内完成。自适应超时默认为启用状态，要在运行时禁用自适应超时，请
在 MGS上将at_max设置为0：

```bash
# lct1 conf_param
```
fsname.sys.at_max=0
注意
在运行时更改自适应超时的状态可能会导致客户端暂时的超时、恢复和重连。
Lustre 超时的消息将始终打印在控制台上。
如果 Lustre 超时未伴随LND 超时，请增加服务器和客户端上的Lustre 超时时间。
使用如下命令进行设置：

```bash
# lct1 set_param timeout=30
```
Lustre 超时参数：
参数
说明
timeout
客户端等待服务器完成 RPC 的时间（默认为100秒）。服务器等

参数
说明
待正常客户端完成 RPC 的时间为此时间的一半，等待单个批量请
求（最多读取或写入4MB）完成的时间为此时间的四分之一。客
户端在超时时间的四分之一处 ping 可恢复目标（MDS 和OST），服
务器将等待超时时间的一倍半再驱逐客户端、将其设置为"stale”"。
Lustre 客户端定期向指定的时间段内没有通信的服务器发送"ping”
消息。文件系统中客户端和服务器之间的任何网络活动和 ping 的效
用相同。
1dlm_timeout
服务器等待客户端回复初始 AST（锁取消请求）的时间。对于
OST，默认值为20秒；对于 MDS，默认值为6秒。如果客户端回
复AST，服务器将给它一个正常的超时（客户端超时时间的一半）
来刷新任何脏数据并释放锁。
fail_loc
dump_on_timeout
内部调试故障钩。默认值为0，表示不会触发或注入任何故障。
超时时触发 Lustre 调试日志的转储。默认值为0，表示不会触发
Lustre 调试日志的转储。
dump_on_eviction
发生驱逐时触发Lustre 调试日志的转储。默认值0，表示不会触
发Lustre 调试日志的转储。

### 39.6. LNet 监控

LNet 信息位于/proc/sys/1net 的以下文件中：

- peers-显示此节点已知的所有NID，并提供有关队列状态的信息。
示例：
1 # lct1 get_param peers
2 nid
refs
3 0@10
4 192.168.10.35@tcp
5 192.168.10.36etcp
6 192.168.10.37etcp
state max rtr min
~KtK
~FtI
~KtK
~Ftr
t×
min
queue

表中各条目含义如下：
条目
说明
refs
引用计数。
state 如果节点是路由器，则表示路由器的状态。对应值有：NA一表示节点不是
路由器。up/down-指示节点（路由器）是否为启动状态。
max
此对等节点的最大并发发送数。
rtr
min
可用的路由缓冲区信用值。
历史最低路由缓冲区信用值。
t×
可用的发送信用值。
queue 活动/排队中的发送总字节数。
信用值被初始化以允许一定数量的操作（如上方示例所示，max列为8）。LNet 跟踪
了监控时间段内看到的最低信用值，以显示此时间段内的高峰拥挤。低的信用值表示资
源更加拥挤。
当前可用的信用值（传输信用值）显示在tx列中。最大发送信用额显示在max中，
且永远不会发生变化。只要tx>=0，就可以通过（max-tx）得出当前活动的传输数量。
一旦tx<O，则该值表示该对等体上因信用值低而排队的传输数量。
rtr列中显示的是可供对等节点使用的路由器缓冲区数量。通过使用相应模块的
peer_buffer_credits 模块参数，可以在LND 层或LNet 层单独配置路由信用值。如果没有
明确设置路由信用值，则默认为 peer_credits 模块参数所定义的最大发送信用值。每当
网关路由一个对等体的消息时，则递减该对等体的可用路由信用值。如果该值为零，那
么消息将排队。如该值为负，则显示等待路由的排队消息的数量。如需获取从一个对等
体路由的消息数量，可以通过（max_rt_credits- rtr）得到。
LNet 还限制了并发发送和分配给单个对等节点的路由器缓冲区数量，从而避免对
等节点占用所有资源。

- nis 一显示该节点上队列当前健康状况。
示例：

```bash
# lctl get_param nis nid
```
t×
min
0@10

### 192.168.10.34@tcp

表中条目的含义如下：
256 256
refs
peer
max

条目
说明
nid
网络接口。
refs
内部引用数。
peer
max
此NID 上点对点的发送信用数，用于调整缓冲池的大小。
此NID 的最大发送信用值。
t×
此NID 当前可用的发送信用值。
min
此NID 当前可用的最低信用值
queue 活动/排队中的发送总字节数。
分析：
（max -tx）为当前活动的发送数量。活动发送量很大或越来越多则表示可能存在问
题。

### 39.7.在 OST上分配空闲空间

可用空间分配使用循环法还是加权法，由 OST 之间可用空间的不平衡状况决定。
OST 之间的可用空间相对平衡时，使用更快的循环分配器。任何两个 OST的可用空间
差别超过指定阈值时，使用加权分配器。
可以使用以下两个可调参数调整可用空间分布：

- lod.*.q0s_threshold_rr -在此文件中设置从循环法切换到加权法的阈值。
默认情况下，任何两个 OST 的不平衡度达到17%时，切换到加权算法。

- lod.*.q0s_Pr1o_free 一可在该文件中调整加权分配器使用的加权优先级。增
加gos_Prio_free的值会增加每个 OST 上可用空间量的权重，减少条带在OST
之间的分布。默认值 91%的权重基于可用空间重新平衡，9%的权重基于 OST
平衡。当可用空间优先级设置为100时，加权器则完全基于可用空间，且不再适
用条带化算法。

- osp.*.reserved_mb_10w一如果可用空间低于此标准，则停止分配对象。默认
值为总 OST大小的0.1%。（在 Lustre 2.9中引入）

- osp.*.reserved_mb_high 一如果可用空间高于此标准，则开始分配对象。默
认值为总 OST 大小的0.2%。（在 Lustre 2.9中引入）


### 39.8.配置锁

1ru_size参数用于控制LRU缓存锁队列中的客户端锁数量。LRU的大小是基于
负载来进行动态优化的，具有不同工作负载（如登录/构建节点和计算/备份节点不同）
的节点可用锁的数量也不同。
可用锁的总数是服务器RAM 的函数。默认限制为每1MB RAM50个锁。如果内存
压力过大，LRU 则更小。服务器上的锁数量被限制为每个服务器的OST 数量、客户端
数量、客户端上所设置的1ru_size值三者的乘积，如下所示：

- 启用LRU大小自动调整，请将1ru_size参数设置为0。在这种情况下，
1ru_size参数将显示导出时使用的当前锁数量。LRU 大小自动调整默认后动。

- 指定最大锁数量，请将1ru_size参数设置为非零值，通常是客户端的CPU 数量
的100倍左右。建议您仅在用户以交互方式访问文件系统的几个登录节点上增加
LRU大小。
清除单个客户端上的LRU，刷新客户端缓存而不更改1ru_size值，请运行：
1 $ lct1 set_param 1dlm.namespaces.osc_namelmdc_name.Iru_size-clear
如果将 LRU 大小设置得比现有未使用锁数量更小，则未使用的锁将被立即取消。
使用clear取消所有锁而不更改该值。
注意
1ru_size参数只能通过1ct1 set_param进行暂时设置（不能进行永久设置）。
禁用LRU 大小调整，请在 Lustre 客户端上运行：
1 $ lct1 set_param 1dlm.namespaces. *osc* .1ru_size-5000
确定授予的动态LRU大小调整的锁数，请运行：
1 $ lct1 get_param ldlm.namespaces.*.pool.1imit
1ru_max_age参数用于控制LRU 缓存锁队列中客户端锁的锁龄（时长）。这样可
以限制未使用的锁在客户端缓存的时间，避免闲置的客户端持有锁的时间过长，从而减
少了客户端和服务器的内存占用，同时也减少了服务器恢复期间的工作。
lru_max_age 以毫秒为单位进行设置和打印，默认为 3900000毫秒（65分钟）。
从 Lustre 2.11 开始，除了以毫秒为单位设置最大锁龄外，还可以用s或ms作为后缀
分别表示秒或毫秒。例如将客户端的最大锁龄设置15分钟（900s）运行：

```bash
1 # lctl set_param 1dlm.namespaces. *MDT* .Iru_max_age-900s
```
2 # lct1 get_param 1dlm.namespaces. *MDT*.1ru_max_age
3 1dlm.namespaces.myth-MDT0000-mdc-ffff8804296c2800.1ru_max_age-900000


### 39.9.设置 MDS 和 OSS线程计数

MDS和OSS线程计数的可调参数可用于设置最小和最大线程计数，或获取下表中
所列服务的当前运行的线程数。
服务
说明
mds.MDS.mdt
mds.MDS.mdt_readpage
mds.MDS.mdt_setattr
ost.OSS.ost
主要元数据操作
元数据readdir
元数据 setattr/close 操作
主要数据操作
ost.OSS.ost_1o
批量数据IO
ost.OSS.ost_create
OST 对象预创建
ldlm.services.1dlm_canceld DLM 锁取消
1dlm.services.1dlm_cbd
DLM 锁授予
对于每个服务，可调参数如下所示：

- 暂时地设置此参数：

```bash
# lctl set_param
```
service.threads_min|max|started=num

- 永久地设置此参数：

```bash
# lct1 conf_param obdname lfsname.obdtype.threads_min |max |started
```
Lustre 2.5及以上版本请运行：

```bash
# Ict1 set_param -P service.threads_minlmax|started
```
以下示例显示了如何设置线程计算及如何使用
service.threads_minlmaxIstarted参数获取ost_1o服务当前运行的线程
数。

- 获取运行的线程数：

```bash
1 # lctl get_param ost.OsS.ost_io.threads_started
```
2 ost.OSS.ost_io.threads_started-128

- 设置线程数的最大值（512）：
1 # 1ct1 get_param ost.OSS.ost_io.threads_max
2 ost.OsS.ost_io.threads_max=512


- 为避免存储重载或针对请求数组，设置线程数的最大值（256）：
1 # 1ctl set_param ost.OSS.ost_io.threads_max-256
2 ost.OSS.ost_10.threads_max-256

- 将线程数的最大值永久地设置力256：

```bash
# lctl conf_param testfs.ost.ost_io.threads_max=256
```
Lustre 2.5及以上版本请运行：

```bash
# 1ct1 set_param -P ost.OSS.ost_io.threads_max=256
```
ost.OSS.ost
-1o.threads_max=256

- 查看threads_max 设置已激活，请运行：
1 # 1ctl get_param ost.OSS.ost_io.threads_max
2 ost.OSS.ost_10.threads_max-256
注意
如果在文件系统运行时更改了服务线程数，则此更改在文件系统停止运行前可能不
会生效。超过新设置的threads_max值的正在运行的服务线程不会被停止。

### 39.10. 调试日志

Lustre 会默认生成所有操作的详细日志以辅助调试。可通过lct1 get_param
debug找到调试的相关标志。
调试的开销会影响Lustre 文件系统的性能。因此，为最小化调试对性能的影响，可
以降低调试级别。这会影响存储在内部日志缓冲区中的调试信息量，但不会改变 syslog
的信息量。当您需要收集日志用于调试各种问题时，可以提高调试级别。
可以使用“符号名称"来设置调试掩码，其具体格式如下：

- 验证使用的调试级别，请运行以下命令来检查用于控制调试的参数：

```bash
# lct1 get_param debug debug= ioct1 neterror warning
```
errOK
emerg ha config console

- 关闭调试（网络错误调试除外），请在所有相关节点上运行以下命令：

```bash
# sysctl -w lnet.debug="neterror" debug = neterror
```

- 如需完全关闭调试，请在所有相关节点上运行以下命令：

```bash
# sysctl -w lnet.debug=0 debug = 0
```


- 为生产环境设置适当的调试级别，请运行：

```bash
# Ict1 set_param debug="warning dlmtrace error emerg ha
```
rpctrace vfstrace" debug=warning dlmtrace error emerg ha
rpCtrace vfstrace
此示例中显示的标志收集了足够的高级信息以帮助调试，但它们不会对性能造成任
何严重影响。

- 为已经设置的标志添加新标志，请在每个标志前面加上"+”：

```bash
# lctl set_param debug="+neterror +ha" debug=+neterror tha
```

```bash
# lct1 get_param debug debug=neterror warning
```
error emerg ha
console

- 移除标志，请在标志前附加”-"；

```bash
# lct1 set_param debug="-ha" debug=-ha # 1ct1 get_param
```
debug debug=neterror warning error emerg console
调试参数包括：

- subsystem_debug 一控制子系统的调试日志。

- debug_path 一指示被自动或手动触发时调试日志转储的位置。

- 默认路径是/tmp/lustre-log。
可使用以下命令设置这些参数：
1 sysctl -w lnet.debug=｛value｝
其他参数：

- panic_on_1bug 一当 Lustre 软件检测到内部问题（I.BUG日志条目）时，会调
用“panic"，从而导致节点崩溃。在配置内核崩溃转储实用程序时，这尤其有用。
Lustre 软件检测到内部不一致时，将触发故障转储。

- upca11 -允许您指定在遇到LBUG日志条目时调用的二进制文件的路径。使用以
下四个参数调用此二进制文件：

- 字符串"LBUG"

- LBUG发生的文件

- 函数名称

- 文件中的行号


### 39.10.1.解析 OST 统计数据

OST stats 文件可用于提供每个 OST 活动的统计信息。例如：
1 # lct1 get_param osc.testfs-OST0000-osc.stats
2 snapshot_time

### 1189732762.835363

3 ost_create
4 ost_get_info
5 ost_connect
6 ost_set_info
7 obd_ping
可使用11stat实用程序监视一段时间内的统计信息。
要清除统计信息，请使用1cstat的-c选项。指定报告统计信息的频率（以秒为单
位），请使用-1选项。在下面的示例中，使用了-c选项先清除统计信息，-110选项设置
为每10秒报告一次统计信息：
1 $ 11stat -c -110 ost_10
3 /usr/bin/11stat: STATS on 06/06/07
/proc/fs/Iustre/ost/Oss/ost_io/ stats on 192.168.16.35@tcp
5 snapshot_time

### 1181074093.276072

7 /proc/fs/lustre/ost/OsS/ost_io/stats @ 1181074103.284895
Cur. Cur.#
Count Rate Events Unit last min
10 req_waittime 8

### 259.75


### 317.49

11 req_qdepth
12 req_active 8
［reqs］ 11
13 reqbuf_avail 8
14 ost_write
Toytes］ 169767 72914 212209.62 397579 91874.29
16 /proc/fs/lustre/ost/OSS/ost_io/stats @ 1181074113.290180
17 Name
Cur. Cur.#
Count Rate Events Unit last
19 req_waittime 31
［usec］
min
20 req_qdepth
［reqs］
21 req_active
22 reqbuf_avai1 31
avg

### 822.79


### 0.03


### 1.77


### 63.79

max
stddev
12245 2047.71

### 0.16


### 0.74


### 0.41


23 ost_Write
Toytes］ 1028467 15019 315325.16 910694 197776.51
25 /proc/fs/lustre/ost/0ss/ost_io/stats @ 1181074123.325560
26 Name
Cur. Cur.#
Count Rate Events Unit last
28 req_waittime 21
［usec］ 14970
29 req_qdepth
［reqs］
30 req_active
［reqs］
31 reqbuf_avail 21
［bufs］
min
avg

### 784.32


### 0.02


### 1.70


### 63.82

max
stddev
12245 1878.66

### 0.13


### 0.70


### 0.39

32 ost_write
Toytes］ 7648424 15019 332725.08 910694

### 180397.87

此示例中每一列的含义如下：
参数
说明
Name
Cur. Count
Cur. Rate

```bash
# Events
```
Unit
last
min
avg
max
stddev
服务事件的名称。有关所跟踪的服务事件的说明，请参阅下表。
在最后一个间隔中发送的每种类型的事件数。
最后一个时间间隔内每秒的事件数。
自事件清除以来此类事件的总数。
该统计信息的度量单位（微秒、请求数、缓冲区数）。
这些事件在它们到达的最后一个时间间隔内的平均速率（每单位/事件）。
例如，在上面的ost_destroy例子中，对于前10秒内的400个对象来说，
每次ost_destroy平均需要736 微秒。
服务启动以来的最低速率（每单位/事件）。
平均速率。
最高速率。
标准差（一些情况下不列入计算）。
下表列出了所有服务共有的事件：
参数
说明
req_waittime
请求在可用服务器线程处理之前在队列中等待的时间。
req_qdepth
此服务的队列中等待处理的请求数。

