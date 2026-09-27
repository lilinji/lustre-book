# 02 硬件规划与系统安装配置 (第 5~10 章)

> 来源：官方 Lustre 中文操作手册 (Lustre Chinese Operations Manual)

请参阅〝第五章 Lustre 硬件配置要求和格式化选项"-----提供了为 Lustre 文件系统
配置硬件的准则，包括对存储，内存和网络的要求。
2.（可选-高度推荐）在 Lustre设备上配置存储。
请参阅〝第六章 Lustre 文件系统的存储配置"---介绍了在 Lustre 存储设备上配备
硬件 RAID 的说明。
3.（可选）设置网络接口绑定。
请参阅〝第七章网络端口绑定设置“—讲解了如何设置网络接口绑定，从而同时
使用多个网络接口，以实现网络冗余或提升带宽。
4.（必要）安装Lustre 软件。
请参阅〝第八章 Lustre 软件系统安装"------介绍了 Lustre 软件安装的准备步骤和实
施步骤。
5.（可选）配置 Lustre 网络（LNet）。
请参阅〝第九章 Lustre 网络配置（LNet）”---介绍了如果默认配置不够的情况下，如
何配置 LNet。在默认配置下，LNet 使用在系统中找到的第一个 TCP/IP 网络。如果你在
使用 InfiniBand 或多个以太网接口，则需要使用 LNet 配置。
6.（必要）配置 Lustre 文件系统。
请参阅〝第十章Lustre 文件系统配置"--提供了简单的 Lustre 配置过程示例，并
介绍了用于完成更复杂配置的工具。
7.（可选）配置 Lustre 故障切換。
请参阅〝第十一章 Lustre 故障切换配置"—-----介绍了如何配置 Lustre 故障切换。

## 第五章Lustre 硬件配置要求和格式化选项


### 5.1.硬件方面的考虑

Lustre 文件系统可以使用任何类型的块存储设备，如单个磁盘，软件 RAID，硬件
RAID，或者LVM 逻辑卷。不同于其他一些网络文件系统，块设备只能连接到Lustre 文
件系统的 MDS 和OSS 节点，而不能由客户端直接访问。
由于块设备仅由一个或两个服务器节点访问，因此无需采用所有服务器都能访问的
SAN（Storage Area Network，存储局域网）。在服务器和存储阵列之间，点对点连接通

常就能提供最简单、性能最好的连接，因此无需采用价格昂贵的交换机。（若需故障切
换功能，那么存储必须连接到多个服务器。）
在生产环境下，最好给MGS 配备单独的存储空间，以便将来扩展到多个文件系统。
但是也可以在一台机器上同时运行 MDS和MGS，并让 MDS 和 MGS 共享同一个存储
设备。
在生产环境中，为了获得最佳性能，非常有必要使用专门的客户端。在非生产环境
或测试环境下，Lustre 客户端和服务器可以在同一台机器上运行。尽管如此，不使用专
用客户端的配置是不受支持的。
警告：如果您将客户端放在MDS或OSS上，可能会出现以下性能和恢复的问题：

- 在同一台机器上运行 OSS和客户端，可能导致低内存问题和内存压力。客户端尝
试将数据写入文件系统，OSS 需要分配页面来从客户端接收数据。如果客户端消
耗了所有内存，那么此操作会由于内存不足而无法执行。这会导致客户端挂起。

- 在同一台机器上运行 MDS和客户端，可能导致恢复和死锁问题，并影响其他
Lustre 客户端性能。
Lustre 只支持服务器测试和运行在64比特CPU 上。Lustre 客户端也一般在64比特
的 CPU上运行测试，以匹配预期的客户使用方式，同时避免32比特CPU 存在的请多限
制，如4GB 内存上限、1GB 的低端内存（low memory，内核可直接寻址）上限、16TB
文件大小上限。此外，由于内核 API 的限制，如果在32比特 CPU上运行 Lustre 备份工
具，而备份工具又必须依赖索引节点号码来正确运行，那么备份工具可能会因为把不同
的文件的索引节点号错看成同一个而混淆了这些文件。
连接到服务器的存储设备通常使用RAID来提供容错能力，还可以选用LVM
（Logical Volume Management）来管理它，随后格式化为 Lustre 文件系统。Lustre OSS 和
MDS 服务器按照文件系统限定的格式进行数据读取、写入和修改。
Lustre 文件系统在 MDT 和OST上使用了日志 （Journal）文件系统技术。对于 MDT，
可通过将其日志放在单独的设备上获得20%的性能提升。
MDS 可以有效地利用多CPU 核，建议至少配备四个处理器核。如果文件系统有许
多客户端，建议为 MDS 配备更多的处理器核心。
注意：Lustre 支持客户端运行在多种CPU 架构上，但有一个限制：客户端上的内核
宏PAGE_SIZE 大小必须与服务器相同。特别地，使用64kB大页的ARM或PPC客户端
可以连接使用4kB 页的x86服务器。

### 5.1.1.对MGT 和 MDT 存储硬件的考量因素

MGT 存储需求很小（即使在最大Lustre 文件系统中也少于 100MB），而且MGT上
的数据访问仅发生在挂载服务器或客户端的时候，所以也不需要考虑磁盘性能。然而，

这些数据对于文件系统的访问至关重要，所以 MGT 应采用可靠的存储，最好配置为镜
像 RAIDI。
对MIDS 存储的访问模式类似于对数据库的访问模式，其中包含大量的寻道和对小
块数据的读后改写。因此，强烈推荐采用寻道时间低得多的存储类型作为MDT，例如
SSD 驱动器或NVMe驱动器，而高转速的SAS磁盘也可以接受。
为了获得最高性能，MDT 应该配置为由一个内部日志和不同控制器下的两个磁盘
组成的 RAIDI。
如果需要更大的MDT，可以创建由一对磁盘组成的多个 RAIDI设备，然后使用这
些RAIDI设备构建 RAIDO 阵列。对于 ZFS，可以在MDT 中使用mirror VDEV。这种
配置方法提供了最高的可靠性，因为在同一个 RAIDI设备中的两个磁盘上同时发生多
个故障的概率非常低。
与此相反（构建一对RAIDO设备组成的 RAIDI），即使只有两个磁盘发生故障，也
有50%的可能性出现可导致整个 MDT 数据丟失的情况。第一个故障使镜像的一半整个
失效，第二个故障则有50%的概率使镜像的剩余一半失效。
如果系统中会存在多个MDT，应根据每个 MIDT 的预期使用方式和负载情况为之指
定相应硬件配置。关于如何往文件系统中添加新的 MDT，请参考第14.7节〝在文件系
统中添加新 MDT"。
警告：MDT0000含有Lustre 文件系统的根目录。如果 MIDT0000 因任何原因而无
法使用，那么文件系统就无法使用。
注意：通过使用 DNE（Distributed NamEspace）特性，1fs mkdir -i
mdt
_index命令可以把文件系统根目录下的子目录，或更下层的任意子目录，从
MDT0000 下分离出来，存储在新添加的MDT 上。这种设置通常对顶层目录很有用，这
样可以把不同的用户或项目指派给不同的 MDT 上，或者将几个大型文件工作集分布到
多个MDT 上。
在 Lustre 2.8 中引入：从2.8版本开始，就可以使用 DNE 条带目录特性，将
单个大型文件目录分散到多个 MDT 上。在创建目录时，可通过1fs mkdir -c
stripe
_count命令，将目录分为多个条带（或分片），其中stripe_count一般是文
件系统中 MDT 的数量。通常，不会在文件系统中的所有目录上都使用条带化目录，因
为相较于非条带目录，条带目录将产生额外开销。而如果大型的目录（目录条目超过五
万个）中有大量输出文件同时创建，条带化目录则会很有帮助。

### 5.1.2. 对OST 存储硬件的考量因素

OSS 存储的数据访问模式是流式1/0模式，它依赖于正在使用的应用程序的访问模
式。每个 OSS 都可以管理多个对象存储目标 （Object Storage Target,OST），每个OST
对应一个卷，在OsS 和多个 OST 之间，还有1/O流量负载平衡机制。为了在网络带宽
和外接的存储带宽之间保持平衡，应合理配置OSS，以防止1/O瓶颈。根据服务器硬件

的不同，OsS 通常服务2到8个目标，每个目标的容量通常在24到48TB 之间，但最高
可达256TB。
Lustre 文件系统容量是存储目标容量总和。例如，64个 OSS，每个OSS 含两个8TB
的OST，则可提供一个容量接近 IPB 的文件系统。如果每个 OST 使用10个 1TB的
SATA 磁盘（在RAID-6 配置中使用8个数据磁盘加2个校验磁盘），每个驱动器可达
50MB/秒的带宽，则每个 OST 则可达400MB/秒的磁盘带宽。如果这个系统作为存储后
端，连接到服务器上，而存储系统网络，例如 InfniBand 网络也提供了相匹配的带宽，
那么每个 OSS 则可以提供高达 800MB/秒的端到端1/O 带宽。（这里描述的架构限制很
简单，但实际上需要慎重地进行硬件选择、基准测试和集成才能获得该结果。）

### 5.2.确定空间需求

MDT 和 OST各自需要的后端文件系统性能特性是相互独立的。MDT 后端文件系
统的大小取决于整个 Lustre 文件系统中所需的索引节点总数，而OST聚合空间大小取
决于存储在文件系统上的数据总量。如果 MGS数据须存储在 MDT 设备上（同时位于
MGT 和MDT），则应增加 100MB 到MDT的预估容量上。
在Lustre 文件系统上每创建一个文件，就会在MDT上消耗一个索引节点，还会在
文件条带所在的每个 OST上各消耗一个 OST 对象。通常，每个文件的条带数目继承于
整个系统的默认条带数目，但单个文件的条带数可用1fs setstripe选项进行设置。
更多细节，请查看第十九章管理文件布局（条带化）及剩余空间。
在Lustre ldiskfs 文件系统中，所有 MDT的索引节点和OST 的对象都会在文件系统
首次格式化时分配好。在文件系统使用过程中，创建一个文件，与该文件关联的元数据
将被存储在预先分配的这些索引节点中，而不会占用任何用于存储文件数据的空闲空
间。如果MDT或OST 已经格式化好，它们ldiskfs上的索引节点总数是无法轻易更改
的。因此，在格式化时应创建足够多的索引节点，并且要预见到短期内的使用情况，预
留一部分增长空间，以避免添加额外存储的麻烦。
默认情况下，由Lustre 服务器用作存储用户数据对象和系统数据的 ldiskfs 文件系统
会预留5%的空间，该空间不会被Lustre 文件系统使用。此外，Lustre ldiskfs 文件系统
在每个 OST上预留400MB 空间，在每个 MDT 上预留4GB 空间用来放置日志，此外还
要预留少量空间，放置限额统计数据。这个预留空间不能用于存储普通数据，因此在保
存任何文件对象数据之前，至少 OST 上的这些空间已被占用。
当MDT或OST使用ZFS作为后端文件系统时，索引节点和文件数据的空间分配
是动态的，索引节点可按需分配。每个索引节点至少需要4kB 的可用空间（如果没有镜
像），除此之外，还有目录、内部日志文件、扩展属性、ACL 等其他开销。ZFS 也同样预
留了全部存储空间的3%左右，用作内部的和冗余的元数据，这部分空间不可 Lustre
所用。由于扩展属性和 ACL 的大小高度依赖于内核版本和站点策略，因此对于期望得
到的索引节点数目，最好高估它所需消耗的空间大小。任何多余的空间都可用于存储更

多的索引节点。

### 5.2.1.确定 MGT 的空间需求

MGT 所需空间通常小于 100MB，该大小是由MGS管理的Lustre 文件系统服务器
总数决定的。

### 5.2.2. 确定 MDT 的空间需求

在计算 MDT 大小时，需要考虑的一个重要因素是存储在文件系统中的文件数量，
而 MDT上每个索引节点至少需要2KiB 的可用空间。由于 MDT 通常使用RAID-1+0镜
像，所需的总存储量还须翻倍。
请注意，每个 MDT 实际使用的空间大小与诸多因素有关，如每个目录下的文件数
量、每个文件的条带数、文件是否含 ACL 或用户扩展属性、每个文件的硬链接数目。
Lustre 文件系统元数据所需的存储通常是文件系统容量的1%到2%，具体取决于文件平
均大小。如果在 Lustre 2.11 或更高版本上使用了第二十章 MDT 数据存储功能（DoM）所
介绍的DoM功能，那么 MDT 空间通常应该占总空间的5%或更多，空间比率取决于小
文件在文件系统中的占比，以及MDT上1od.*.dom_stripesize的限制，还有文件
的布局方式。
对于基于 ZFS的MDT 文件系统，在MIDT 和OST上创建的索引节点的数量是动态
的，因此不太需要预先确定索引节点的数量，但是仍然需要根据总文件系统的大小而考
虑 MDT 的总空间大小。
例如，如果文件平均大小为 SMiB，而您有100TiB 可用的OST 空间，那么您可以
计算出每个 MDT 和 OST 的索引节点最小总量：（500 TB * 1000000 MB/TB）/ 5
MB/inode = 100M inodes.
建议您将 MDT 空间至少设置为最小索引节点总量的两倍，从而方便未来扩展，或
者预防文件平均大小小于预期。因此，ldiskfs MDT 的最小空间为：2 KiB/inode x
100 million inodes x 2 = 400 GiB.
注意：如果平均文件大小非常小，例如只有4KB，那么每个文件在MDT 上所占用
的空间将会和在OST上一样多。因此在这种情况下，强烈建议DoM。考虑到每个索引
节点的额外数据空间使用情况，每个索引节点上的 MDT 空间也应做出相应的增加：
6 KiB/inode x 100 million inodes x 2 = 1200 GiB
注意：如果 MDT 的索引节点太少，则会因无法创建新文件而导致OST上的空间无
法被使用。这种情况下，1fs df -i和df -1命令会将文件系统的空闲索引节点的数
量限定为OST上可用对象的总数。在格式化文件系统之前，请一定确认文件系统所需
MDT 的合适大小。在文件系统格式化后，若存储允许的话，还是可以增加索引节点数
量的。对于 ldiskfs MDT 文件系统，如果底层块设备为LVM逻辑卷，而且其大小可扩

展，则可使用 resize2ts 工具。对于 ZFS，可添加新的（镜像后的）VDEVs到MDT池中，
以增加作为索引节点存储的总空间。索引节点会根据增加的空间容量而按比例增加。
注意：对于基于 ZFS的MDT 和OST，1fs df -1所报告的索引节点总数和空闲
数是基于当前每个索引节点所使用的平均空间大小来估计的。当首次格式化 ZFS 文件
系统时，估算出来的空闲索引节点数量将会很保守（低），这是因为，为存储内部Lustre
元数据而创建的目录与文件，两者数目间的比值很高（译者注：因此每个索引节点占用
的平均空间较大）。随着普通用户创建文件越来越多，但该估计值会逐渐提高，此时文
件的平均大小将更好地反映实际的站点使用情况。
注意：基于 DNE远程目录特性，通过在文件系统中配置额外的MDT，可以增加
Lustre 文件系统的索引节点总数，同时提升元数据聚合性能。

### 5.2.3. 确定 OST 的空间需求

对于OST，每个对象所占用的空间，取决于运行在系统上的用户或应用程序的使用
模式。Lustre 软件对平均对象大小的估计较为保守（介于每个对象64KiB 和1MiB之间，
前者是对具备10GiB 容量的OST 的估计，后者为对具备16TiB 容量的OST的估计）。如
果确信应用程序的文件平均大小与此不同，您可以指定其他的平均文件大小（在规定的
OST 容量下索引节点的总数），从而减少文件系统开销，并且使得文件系统检查时间降
到最短。

### 5.3. 设置ldiskfs 文件系统的格式化选项


```bash
默认情况下，mkfs.lustre 工具将下面这些选项应用于存储数据和元数据的 Lustre 文
```
件系统，以提高Lustre 文件系统性能和可扩展性。这些选项包括：

- £lex
_bg：启用flexible-block-groups特性，属于多个块组（Block Group）
的块位图及索引节点位图将聚集在一起，从而尽量减少读取或写入位图时的寻
道操作，而且可以在典型的RAID 存储（RAID 条带宽度IMiB）上减少读/修
改/写这类操作。OST 和 MDT 文件系统上都启用了该标志。在 MDT文件系统
中，flex_bg被设置为默认值 16。在OST 中，Elex_bg被设置为256，这样单
个flex_bg中，对所有的块位图或索引节点位图的读写可在一次1MiB 的1/O中
完成，而1MiB 的1/O对于RAID 存储具有典型性。

- huge_file：设置此标志以允许OST 上的文件大于 2TiB。

- lazy_journal_init：如果没有打开这个选项，在格式化时，需要覆盖写入从
而清零 Lustre 文件系统中默认分配的大块日志（OST 中高达 400 MiB，，MDT 中高
达4GiB）。这个扩展选项可延迟这一覆盖写入，从而减少格式化时间。

```bash
我们可通过添加mkfs.lustre的参数来将格式化选项传递至后端文件系统，覆盖
```
默认的格式化选项：

--mkfsoptions='backing fs options'

```bash
其他的mkfs.lustre的参数，请参看mke2fs （8）的Linux 手册。
```

### 5.3.1.为基于ldiskfs的 MDT 设置格式化选项

MDT上的索引节点总数在格式化时确定，由要创建的文件系统总大小决定。在
基于 ldiskfs 的MDT 上，默认的每索引节点字节数比率（Bytes-per-Inode Ratio,Inode
Ratio）被优化为每2560个字节的文件系统空间对应一个索引节点。
这个设置考虑到了 ldiskfs 文件系统级别的元数据所需要的额外空间，比如日志（最
多4GB）、位图和目录，同时还考虑到了Lustre 用来保持集群内部一致性的文件。此外，
还有每个文件的元数据，比如含多个条带的文件的布局信息、访问控制列表（ACL）、用
户扩展属性。
在 Lustre 2.11 中引入：Lustre 2.11 引入了在 MDT 上存储数据（DoM）的特性，允
许在 MDT 上存储小文件，从而利用闪存存储的高性能，并且减少空间和网络开销。如
果您打算将 DoM特性与ldiskfs MDT 一起使用，建议增加每索引节点字节数的比率，从
而在 MDT 上为小文件留出足够的空间，方法如下所述。
当首次格式化基于 ldiskfs 的

```bash
MDT 时，通过 在mkfs.lustre添
```
加--mkfsoptions="-i bytes-per-inode"选项，可把不同于默认的每索引
节点2560字节的默认值修改为其他值。通过减小每索引节点字节数，可在大小给定的
MDT上创建更多的素引节点，但为每个文件预留的额外元数据空间则变少，因此不推
荐这么做。每索引节点字节数必须始终大于 MDT上索引节点的的大小（默认为1024字
节），建议采用的每索引节点字节数，至少比索引节点的大小还大 1536字节，以确保不
会耗尽 MDT 的空间。对于DoM，建议增加每索引节点字节数，从而为最常见大小的文
件提供足够的空间（例如文件普遍为4KB 或64KB，则应为每个索引节点保留5632字
节或66560字节）。

```bash
通过添加--stripe-count-hint=N，可以让mkfs.lustre根据文件系统使用的
```
默认条带数来自动计算合理的索引节点大小，也可以直接通过设置--mkfsoptions
="-I inode-size"选项，来改变索引节点大小。增加索引节点大小意味着索引节点
内部拥有更大的空间，以便存储更多的文件元数据，包括 Lustre 文件布局、ACL、用户
和系统扩展属性、SELinux 和其他安全标签、其他内部元数据、DoM 数据等。但如果这
些功能都不需要，也不需要在索引节点内部存储扩展属性，那么采用更大的索引节点大
小可能会损害元数据性能，因为每次访问 MDT 索引节点都需要读取或写入2倍、4倍
甚至8倍的数据。


### 5.3.2. 为基于ldiskfs 的OST 设置格式化选项

在格式化一个 OST 文件系统时，应把本地文件系统的使用情况考虑进去，例如通
过在当前文件系统上运行df和df -1来分别获取已用字节和已用索引节点，然后计算
平均的每索引节点字节数。在给新系统指定每索引节点字节数时，在为将来更小的文件
预留足够大回旋余地的同时，应尽量避免在每个 OST上创建太多的索引节点。这有助
于减少格式化时间和 e2fsck 时间，同时为数据保留更多可用空间。
下表列出了，在格式化时基于不同 OST 大小的默认每索引节点字节数。
LUN/OST 大小
默认的每索引节点字节数 索引节点总数
10GiB 以下
每索引节点 16KiB
640 至 655k
10GiB 至 1TiB
每索引节点 68KiB
ITiB 至 8TiB
每索引节点 256KiB
153k 至 15.7M

### 4.2M 至33.6M

8TiB 以上
每索引节点 1MiB

### 8.4M 至268M

在小文件很少的环境中，因其较大的平均文件大小，默认的每索引节点字节
数将可能会导致索引节点数目过多。在这种情况下，可以通过增加每索引节点

```bash
字节数来提高性能。为了指定每索引节点字节数，请给mkfs.lustre命令指定参
```
数--mkfsoptions="-i bytes-per-inode"，从而指定OST 对象的期望平均大小。
例如，下面的命令用于创建一个平均对象大小预期为8MiB 的OST：

```bash
［oss #］ mkfs.lustre --ost --mkfsoptions="-i $（（8192 *
```
1024））"…•
注意：使用ldiskfs 格式化的OST，每个 MIDT 最好少于3.2亿个对象，且最多不超
过40亿个索引节点。如果为一个超过此限制的大型 OST 指定了非常小的 inode ratio，
可能导致过早地出现空间超限错误，OST 空间不能被全部使用，从而造成空间浪费，使
e2fsck 速度变慢。因此，请选择默认的 inode ratio，以确保索引节点的总数仍然低于这
个限制。
注意：OST 文件系统检查时间受到包括索引节点数量在内等一系列变量的影响，如
文件系统的大小、分配的块数量、分配块在磁盘上的分布、磁盘速度、CPU 速度、服
务器上的内存数量。对于正常运行的文件系统，合理的文件系统检查时间大概在每 TiB
5-30 分钟左右，但如果检测到大量错误并需要修正，时间则会显著增加。
关于更多如何优化 MDT 和 OST 文件系统的细节，请参考第6.4节，Idiskfs RAID
设备的格式化选项。


### 5.4. 文件和文件系统的极限值

下表描述了当前Lustre 的已知极限。这些极限值可能受限于 Lustre 体系结构、Linux
虚拟文件系统（Virtual File System,VFS）或虚拟内存子系统。其中少数极限值是在代
码中基于测试结果定义的，可以通过修改和重新编译Lustre 软件进行更改。在这种情况
下，这些受 Lustre 代码限定的极限值，被用来测试 Lustre 软件。
名称
值
描述
最大 MDT 数量
最大 OST 数量
最大 OST 大小
Idiskfs: 1024TiB；
ZFS: 1024TiB
最大客户端数量 131072
单MIS 可以承载一个或多个 MDT，可以分属不同
的文件系统，也可以聚合为同一个命名空间。每个文
件系统都要求使用一个独立的 MDT 来存储根目录。
至多可添加255个MDT 到文件系统，它们使用 DNE
远程目录或条带目录添加到文件系统命名空间中。
OST 的最大数量是一个可以在编译时改变的常量。
曾有Lustre 文件系统配置过多达4000个OST。
单个 OSS 节点上可配置多个 OST 目标。
这不是一个硬性限制。配置更大的OST 是可以的，
但是大多数生产系统通常不会超过该限制，因
为 Lustre 可以通过增加额外的 OST 来提升容量
和性能，提高以及I/O 总体性能，使拥塞降到
最低，并且可进行并行恢复 （e2fsck 或scrub）。
对于32比特内核，由于页面缓存限制，最大块设
备大小被限制为 16TB，因此也限制了 OST 大小。
强烈建议使用64 比特内核运行 Lustre 客户端
和服务器。
客户端的最大数量是一个可以在编译时改变的
常量。在生产环境中曾使用过高达30000个客户端。
可将每个 OST 配置成最大 OST大小，然后
最大单文件系统 2EiB 或更大
大小
将所允许的最大数量的 OST 组合成单个文件系统。

名称
值
最大条带数
最大条带大小
最小条带大小
<4GiB
64 KiB
最大单个
对象大小
ldiskfs: 16TiB；
ZFS: 256TiB
最大文件大小
32 比特系统：16 TiB；
64 比特ldiskfs
系统：31.25PiB；
64 比特 ZFS
系统：8EiB
描述
该值受存储在磁盘上并以 RPC请求形式发送的布
局信息大小限制，但这不是协议中的硬性限制。
文件系统中的OST 数量可以超过条带数量，但本
限制是单个文件所能条带化的 OST 数量的最大值。
Lustre 2.13 引入：在2.13之前，基于ldiskfs
的MDT在默认情况下单文件的最大条带数上限
160个OST；在格式化 MDT 时使用
mkfsoptions="-0 ea_inode"可增加该值；
在格式化 MDT后，可以使用
tune2fs -0 ea_inode来启用这个功能。
在切换到下一个对象前写入到每个对象的数据量。
由于在某些64位机器（如 ARM 和 POWER）上
的64KiB PAGE_SIZE 限制，条带大小的最小值
被限定为64 KiB。这样单个页面就不会被拆分
到多个服务器上。这也是 Data-on-MDT 布局
组件可以指定的最小值。
即可以存储在单个对象中的数据量。一个对象对应
一个条带。ldiskfs 的限制为 16TB，适用于单
个对象。对于ZFS，该限制来自于底层 OST 的
大小。文件最多可以包含2000个条带，每个条
带都可达到这个最大对象大小。
受内核内存子系统限制，在32位系统上的单个文
件大小最大为16TiB。在64位系统上，这个限制
不存在。因此，如果后备文件系统可以支持足够
大的对象，并且/或者是这个文件是空洞文件，
则文件大小可以达到2~63位（8EiB）。

名称
值
单个目录下
最大文件或
子目录数量
文件系统上
最大文件数量
描述
单个文件最多可以有2000个条带，这使得64位
ldiskfs 系统的单个文件所消耗的容量能达到

### 31.25PiB。文件中可存储的实际数据量取决于

文件条带所在的 OST 有多少可用空间。
Idiskfs: 600M 到 3.8B
个文件；
ZFS:16T个文件
Lustre 软件使用了ldiskfs 目录哈希代码，
其目录项上限至少约为6亿，最终取决于，
文件名长度。子目录数目的上限与常规文件
相同。在 Lustre 2.8 中引入，注意：
从 Lustre2.8开始，可通过1fs mkdir -c命令
把单个目录分条道多个 MDT上，从而突破此限制，
目录条带数为多少那么该目录下的最大文件
或子目录数量就可以增加多少倍。
在 Lustre 2.8中引入，注意：从2.14版本开始，
Idiskfs 的large_dir功能默认为启用，支持目录
拥有超过10M 的条目；在2.12版本中，
large_dir功能存在，但默认不启用。
ldiskfs： 每 MDT 容纳40亿；
ldiskfs 文件系统的上限为40亿个索引节点。默认
ZFS： 每MDT 容纳 256万亿 情况下，MDT 文件系统被格式化为每2KB对应一个
索引节点，即每1Ti的 MDT 空间有5.12亿个索引
节点。这个数值可以在 MDT 文件系统初始创建时
增加。更多信息，参看第五章，Lustre硬件
配置要求和格式化选项。
ZFS 文件系统动态分配索引节点，因此在 MDT上
没有固定的每索引节点字节数比率，但每个
索引节点消耗大约 4KiB 的镜像空间，具体数值
取决于配置。

名称
值
最长文件名
255 字节
最长路径名
Lustre 文件
系统上当前
打开的文件
最大数量
4096 字节
无限制
描述
每个新加的 MIDT 可容纳的文件都可达到上述最大
数量，最终取决于 MDT的可用空间，以及文件
系统中目录和文件分布在哪些 MDT 上。
包括底层文件系统在内，单个文件名的最大限制
为255字节。
受 Linux VFS 限制，最长路径名为4096字节。
Lustre 软件对打开的文件数量没有限制，但
实际上，它还是受制于 MDS上的内存大小。
MDS上没有所谓当前已打开文件的"列表”，这些
已打开文件只会链接到对应客户端的 Export。
每个客户端进程最多能打开几千个文件，这取决
于其ulimit。

### 5.5. 确定内存需求

本节介绍每种 Lustre 文件系统组件对内存的需求。

### 5.5.1. 客户端内存需求

建议客户端至少配备2GB内存。

### 5.5.2. MIDS 内存需求

MDS 内存需求由以下因素决定：

- 客户端最大数量

- 目录大小

- 服务器的负载
MDS使用的内存容量取决于系统中有多少客户端，以及它们使用的工作集中有多
少文件。它主要是由在某一时刻客户端持有的 LDLM （Lustre Distributed Lock Manager）
锁总数决定。客户端持有锁总数因服务器上的负载和可用内存而异。交互式客户端有时
可能持有超过1万个锁。在MIDS上，每个当前正在使用文件大约消耗 2KB的内存，其

中包括 LDLM锁和内核数据结构。与从磁盘读取数据相比，将文件数据放在缓存中可
以将元数据性能提高10倍甚至更多。
MDS 内存需求包括：

- 文件系统元数据：需要合理数量的RAM 以支持文件系统元数据。文件系统的元数
据量没有硬性限制，可用RAM 越多，检索元数据就更少需要进行磁盘1/0。

- 网络传输：如果您使用的是TCP 或其他使用系统内存来作为发送/接收缓冲的网
络，那么也需要把这些内存需求考虑在内。

- 日志大小：默认情况下，用于每个基于ldiskfs 文件系统的MDT 需要大小为
4096MB 的日志 （Journal）。每个文件系统在 MDS 节点上占用相同数量的RAM。

- 故障切换配置：如果 MDS 节点会用于从另一个节点进行故障转移（Failover），那
么每个文件系统日志所需的 RAM 应翻倍。这样当主服务器发生故障时，备份服务
器才有能力处理额外的负载。

### 5.5.2.1. 计算MDS 内存需求

默认情况下，文件系统日志使用4096MB。额外的RAM会用于缓存更大工作集里
的文件数据，通常这个工作集并不时时处于活跃状态，但应给它保温以提升访问速度。
在没有锁的情况下，缓存每个文件大约需要 1.5KB 内存。
举个例子，在MDS上的单个 MDT，有1024个计算节点，12个交互节点，工作集
包含2000万文件的（其中同一时刻有900万个文件缓存在客户端上）：
操作系统开销 =4096 MB（RHEL8）
文件系统日志=4096MB
1024*32 核客户端*256个文件/核 *2kB=16384MB
12个交互式客户端*100,000个文件*2KB=2400 MB
20,000,000文件的工作集*1.5KB/文件=30720 MB
因此，这个 MIDS 的合理配置是至少需要60GB 内存。如果 MDS 同时还作为DNE
的主动/主动故障转移对，那么应该至少为每个 MDS 配备96GB 的内存。这部分额外的
内存，可以在正常运行期间，缓存更多的元数据和锁，从而提高性能，这有赖于具体的
工作负载。
对于包含100万或更多文件的目录，更多的内存大有裨益。例如，当一个客户端随
机访问一个包含1000万个文件的单个目录时，在MDS上可能消耗多达35GB 的内存。

### 5.5.3. OSS 内存需求

在为一个 OSS 节点规划硬件时，需要考虑到Lustre 文件系统中几个组件的内存使
用情况（如：日志、服务线程、文件系统元数据等）。另外，还需要考虑到OSS的读取
缓存特性，这个特性在缓存数据时会消耗OSS 节点上的内存。
除了包含上文中提到的MDS 内存需求外，OSS的内存要求还包括：


- 服务线程：OSS 节点上的服务线程为每个ost_1o服务线程预先分配 1/O缓冲区，
缓冲区大小等于RPC 的最大大小，这样就不需要为每个1/O 请求来分配又释放缓
冲区。

- OSS 读取缓存：OSS 读取缓存提供对机械磁盘数据的只读缓存，它使用常规的
Linux 页面高速缓存来存储数据。与Linux 操作系统中常规文件系统的缓存一样，
OSS 读取缓存会尽力使用所有可用的物理内存。
由于文件访问而消耗的内存，其适用于 MIDS的计算方式也同样适用于从OSS，但
文件访问的负载一般分布在更多的OsS 节点上，因此为MIDS列出的锁、索引节点缓存
等所需的内存容量也应该分散在这些 OSS 节点上。
由于上述这些内存需求，在确定 OSS 节点所需的最小RAM大小时，应采用下面的
计算方式。

### 5.5.3.1. 计算OSS 内存需求

-个OSS上，如果它连接了8个 OST，处理的对象数目为MIDS上活动文件的1/4，
那么推荐的最小 RAM 容量计算如下：
Linux 内核与用户空间守护进程的内存=4096 MB
以太网/TCP 发送/接收缓冲区（16 MB *512线程）=8192 MB
1024 MB 日志大小*8个 OST设备=8192MB
每个 OST IO 线程的16 MB 读/写操作缓存*512个线程=8192 MB
2048 MB文件系统读取缓存*8 OST=16384MB
1024 *32 核客户端*64 个文件/核 *2KB/文件=4096MB
12个交互式客户端*25,000个对象*2KB/对象=600MB
5,000,000对象（工作集）*1.5KB/对象=7500MB
因此，在没有故障切换的配置中，连接8个 OST 的OSS 节点，它需要的RAM 容
量最少约为60GB。在OSS上添加额外的内存，可以提高频繁访问的小文件读取性能。
在有故障切换的配置中，需要的RAM 容量最少约为90GB，因为在每个节点上都
需要预留一部分内存。当OSS 无需处理任何故障切换的 OST 时，额外的RAM 将被用
作读取缓存。
作为一个合理的经验法则，可以为 OSS 配备24GB 的基础内存，加上每个 OST额
外4GB 的内存。在故障切换配置中，每个 OST 需要配备额外8GB 的内存。

### 5.6. Lustre 文件系统网络的实施

作为高性能文件系统，Lustre 文件系统会对网络产生大量的负载。因此，每个 Lustre
服务器和客户端通常都会有一个专门的网络接口，用作文件系统数据通信。通常情况下
使用专用的TCP/IP子网，但也可使用其他网络硬件。
一个典型的 Lustre 文件系统实现通常包括：


- Lustre 服务器的高性能后端网络，通常是 InfiniBand（IB）网络。

- 一个更庞大的客户端网络。

- 连接两个网络的 Lustre 路由器。
通过在/etc/modprobe.d/lustre.conf配置文件中，给Lustre 网络模块（Lustre
Networking,Lnet） 指定参数可以配置和管理 Lustre 网络和路由。
在准备配置Lustre 网络时，请逐一完成以下步骤：
1.确定有哪些机器会运行Lustre软件，而它们又使用哪些网络接口来进行 Lustre 文
件系统通信。这些设备将形成 Lustre网络。
网络是一组相互直接通信的节点。Lustre 软件包含了 Lustre 网络驱动器（Lustre
Network Driver, LND），以支持各类网络和硬件（完整的支持列表，请参看第二章，理
解 Lustre 网络（LNet））。配置网络的通用规则也适用于 Lustre 网络。例如，两个不同
子网（tcpO和tcp1）上的两个 TCP 网络被认为是两个不同的 Lustre 网络。
2. 如果需要路由，请确定在不同网络间作为路由的节点。如果使用多种网络类型，
那么您将需要路由。任何具有合适接口的节点，都可以在不同的网络硬件类型或
拓扑之间，作为 Lustre 网络（LNet）通信的路由。这些节点可以是Lustre 服务器、
客户端，或者只作为路由。LNet 可在不同的网络类型间（如从 TCP 到 InfiniBand）
或跨越不同的拓扑（如桥接两个 InfiniBand 或TCP/IP 网络）传输消息。关于如何
配置路由，请参看第九章，配置 Lustre 网络 （LNet）。
3. 确定有哪些网络接口要接入或排除在 LNet 网络内。
如果没有明确指定，对每个特定的网络类型，LNet 要么使用第一个可用接口，要么
使用预定义默认值接口。LNet 不应该使用的接口（如管理网络或 IP-over-IB）需要排除
在外。
通过内核模块参数网络networks和ip2nets，可以指定使用或排除哪些网络接
口。关于如何设置参数，请参看第九章，配置 Lustre 网络（LNet）。
4. 如果网络配置较为复杂，确定一个集群模版，以简化网络安装。
对于大型集群，您可以通过在每个节点上的lustre.conf文件中配置一个统一
的参数集，来配置所有节点的网络。关于网络配置的集群模版，请参看第九章，配置
Lustre 网络（LNet）。
注意：我们建议您使用IP 地址而不是主机名，这样调试日志的可读性更强，而为
多个网络接口调试配置也更容易。


## 第六章配置 Lustre 文件系统上的存储

本章介绍一些如何选择存储和文件系统选项，从而在 RAID上获得最优性能的最佳
实践。本章包含以下章节：

- 6.1节，为MIDTs和 OSTs选择存储设备

- 6.2节，可靠性的最佳实践

- 6.3节，性能折衷

- 6.4节，为基于ldiskfs 的RAID 设备设置格式化选项

- 6.5节，将SAN 连接至Lustre 文件系统上
注意：强烈建议将 Lustre 文件系统的硬件存储配置为 RAID。Lustre 软件并不支持
文件系统级别的冗余，因而需要 RAID 来防备磁盘故障。

### 6.1. 为MDT 和OST 选择存储设备

Lustre 体系架构允许采用任何类型的块设备作为后端存储。但这些设备的特性差别
很大，尤其是在发生故障的情况下，也影响了系统配置的选择。
本节内容介绍关于后端存储的问题和建议。

### 6.1.1. 元数据目标（MDT）

在MDT上的1/O通常主要是数据的少量读写，因而我们建议您为 MDT 存储配置
RAIDI。如果您需要的容量超过了单个磁盘，我们则建议您配置 RAID1+0 或 RAID10。

### 6.1.2. 对象存储服务器（OST）

通过下面的快速测算，我们可以知道如果没有其他冗余，大型集群应配置力RAID6
，而RAID5 是不可接受的。
假设一个 2PB 文件系统（2000个容量1TB 的磁盘）的磁盘平均故障时间（MTTF）
为1000天。这意味着失败率的期望值是2000/1000 = 2个磁盘/天。如果修复带宽占
磁盘带宽的10%，那么磁盘修复时间则是1000 GB /10 MB per sec = 100,000
seconds，也就是大约1天。
而对于一个含10个磁盘的RAIDS，在重建的1天当中，相同阵列中的第二个磁盘
失败的几率大约是9/1000或每天1%。50天之后，RAIDS 阵列则有50%的几率出现双
重故障，导致数据丢失。
因此，非常有必要采用 RAID6 或其他的双重奇偶校验算法来为 OST存储提供足够
的冗余。

为了获得更好的性能，我们建议您使用4个或8个数据磁盘和一个或两个奇偶磁盘
来创建 RAID 阵列。相比于采用多个独立的 RAID 阵列，使用更大的RAID 阵列将会对
性能造成负面影响。
为了获得细粒度1/O 请求的最高性能，可将存储配置为RAID1+0，但这将增加成
本、降低容量。

### 6.2. 可靠性的最佳实践

推荐使用 RAID 控制软件以快速检测出发生故障的磁盘，并及时将其替换，从而避
免双重故障和数据丢失。推荐使用热备份磁盘，这样 RAID 重建不会有延迟。
推荐及时备份文件系统的元数据。关于备份文件系统，请参看第十八章，备份和恢
复文件系统。

### 6.3. 性能折衷

在写操作的粒度不是整个条带宽度的情况下，RAID 存储控制器中的回写缓存可以
极大地提高多种RAID 阵列的写性能。不幸的是，除非RAID 阵列配备的缓存是电池供
电缓存（这个功能只有一些价格较高的硬件 RAID 阵列才支持），否则阵列电源中断可能
会导致写入失序或者写丢失、奇偶校验损坏或/和文件系统元数据损坏，这些问题会导
致数据丢失。
在支持高可用（High-Availability，HA）故障切换的配置中，在MDS 或OSS上的
PCI 适配卡上配备读取或回写缓存是不安全的，因为这会导致节点之间的不一致，进而
直接或最终导致文件系统损坏。应该避免使用这种设备，或者禁用其板载缓存。
如果回写缓存已启用，那么在阵列断电后需要对文件系统进行检查。这种情况下也
可能发生数据丢失。
因此，当数据完整性极其重要时，我们建议避免使用回写缓存。请您审慎地考虑启
用回写缓存是否利大于弊。

### 6.4. 为基于ldiskfs 的 RAID 设备设置格式化选项

当在 RAID 设备上格式化 ldiskfs 文件系统时，确保1/O 请求与底层RAID 对齐大有
裨益。这避免了 Lustre RPC 产生不必要的磁盘操作，从而大大降低性能。在格式化 OST
或MDT时，可使用--mkfsoptions参数以指定额外的参数项。
对于 RAIDS、RAID6 或RAIDI+0 存储，在--mkfsoptions下指定以下参数可改
进文件系统元数据的布局，确保没有把所有的分配位图都存储在单一的磁盘上：
-E stride = chunk_blocks
chunk_blocks变量以4096 字节大小的块为单位，含义是在移动到下一个磁盘前，
连续写入到单个磁盘的数据量。它同时也被叫做 RAID 条带大小。它对于 MDT 和 OST

两者都适用。
更多关于在格式化 MDT 和 OST 文件系统的时候，如何覆盖默认参数的信息，请参
考5.3节，设置ldiskfs文件系统的格式化选项。

### 6.4.1. 为 mkfs 计算文件系统参数

为了获得最好的结果，建议采用含5个或9个磁盘的RAIDS，或含6个或10个磁
盘的 RAID6。RAID 的条带宽度就是最小1/O 的最佳粒度。理想情况下，RAID 配置应
使得1MB 的Lustre RPC 正巧匹配单个 RAID 条带，而无需任何昂贵的"读-修改-写"流
程。以下为计算stripe_width的公式：
stripe_width_blocks = chunk_blocks * number_of_data_disk =
1 MB
其中number_of_data_disk不包括 RAID 奇偶校验磁盘（RAIDS 有一个奇偶校
验磁盘，RAID6 有两个）。
如果 RAID 配置无法让chunk_blocks恰 好能装进IMB 里，那么就
让stripe_width_blocks接近但不大于 1MB。
stripe_width_blocks的
值必须等
JChunk
_blocks *
number_of_
_data_disks的 值。仅在使用 RAIDS 或 RAID6 时，需指
定stripe_width_blocks参数，RAID1+0 则不需要。
下面的参数，用于在文件系统设备（/dev/sdc）上运行--reformat时，向底层
Idiskfs 文件系统指定 RAID 配置：
--mkfsoptions "other_options -E stride=chunk_blocks，
stripe_width=stripe_width_block"
例如，如果一个含6个磁盘的 RAID6，配置有4个数据和2个奇偶校验磁盘，那
么chunk_blocks <= 1024KB/4 = 256KB。由于数据磁盘的数量为2的指数，条带
宽度恰好为1MB。

### 6.4.2. 外部日志的参数设置

如果您配置了 RAID 阵列并直接使用它作为 OST，那么其中就同时存储了数据和元
数据。为了获得更好的性能，我们建议将 OST 日志（Journal）放在一个单独的设备上，
也就是创建一个小型 RAID1 阵列，并将其作为 OST 的外部日志。
在一个典型的Lustre 文件系统中，默认的 OST 日志大小高达1GB，默认的 MDT 日
志大小高达4GB，这样可以高速率处理事务（Transaction），而无需阻塞在日志刷新上。
此外，此外，日志在 RAM 中有副本。因此，请务必确保服务器有足够的RAM 来保存
所有日志的副本。

```bash
文件系统日志选项可以通过使用--mkfsoptions参数指定给mkfs.lustre，例
```

如：
--mkfsoptions "other_options -j-J device=/dev/mdJ"
想要创建一个外部日志，请在OSS上的每个 OST执行以下步骤：
1.创建一个400MB（或更大）的日志分区（建议使用RAIDI，在本例中，/dev/sdb是
RAID1设备）。
2. 在分区上创建一个日志设备。运行：
［oss#］ mkezfs -b 4096 -0 journal_dev /dev/sdb journal_size
其中journal
_size以 4096字节块为单位。如，1GB 的日志大小为262144。
3. 格式化 OST。
在本例中，被用作OST 的/dev/ sdc是RAID6 设备，运行：

```bash
［oss #］ mkfs.lustre --ost...\
```
--mkfsoptions ="-J device=/dev/sdb1" /dev/sdc
4. 正常挂载 OST。

### 6.5. 将 SAN 连接至 Lustre 文件系统上

根据您的集群规模和工作负载情况，您可能希望通过 SAN连接至Lustre 文件系统。
在连接之前，请考虑以下因素：

- 在许多SAN 文件系统中，客户端在更新数据块或索引节点时，会单独对数据块或
索引节点进行分配和上锁。而Lustre 文件系统的设计，则避免了这种在块和 inode
上的高度竞争。

- Lustre 文件系统具有高度可扩展性，可能拥有非常多的客户端。SAN 交换机无法
扩展到大量节点，而SAN的单位端口成本通常高于其他网络。

- 允许客户端以 direct-to-SAN 方式接入的文件系统存在安全风险，因为存在客户端
能够读取 SAN磁盘上任何数据的潜在可能，有问题的客户端可能因多种原因破坏
文件系统，如不当的文件系统软件、网络软件或其他内核软件，破损的电缆，坏
掉的内存等等。随着直接访问存储的客户端数量的增加，这种风险会成倍增加。

## 第七章网络端口绑定的设置

本章介绍如何并发使用多个网络接口，以增加性能或/和冗余度。其中话题包括：

- 7.1. 绑定网络端口的概述


- 7.2. 相关要求

- 7.3. 网口绑定的模块参数

- 7.4. 设置绑定
注意：绑定网络端口为可选功能。

### 7.1.绑定网络端口的概述

绑定，也称为链路聚合（Link Aggregation），聚合（Trunking） 和端口聚合（Trunking），
是一种为了增加带宽而将多个物理网络链路聚合为单个逻辑链路的方法。
Linux 发行版中提供了几种不同类型的绑定。所有这些类型的绑定都使用绑定内核
模块，被称为模式（Mode）。
模式0到模式3通过使用多个接口完成负载平衡和容错。模式4将一组接口聚合成
单个虚拟接口，而组里的所有成员共享相同的速度和双工设定。该模式的相关描述可在
IEEE spec 802.3ad 里找到，被称为模式4或者802.3ad。

### 7.2. 相关要求

成功绑定的最基本的需求是，连接的两个端点都支持绑定。在正常情况下，非服务
器的那个端点是交换机（通过交叉线连接的两个系统也可以使用绑定）。而所使用的任
何交换机都必须明确处理 802.3ad 动态链路聚合（Dynamic Link Aggregation）。
同时，内核也必须配置为具备绑定支持。所有具备支持的Lustre 内核都包含绑定功
能。需要绑定的接口，其网络驱动程序必须具有ethtoo1功能，以确定从属端口的速度
及其双工设置。最新的网络驱动器都具备该功能
下面的命令用于验证您的接口是否适用ethtoo1：
1 # which ethtool
2 /sbin/ethtool
4 #ethtool ethO
5 Settings for ethO：
Supported ports： ［ TP MII ］
Supported link modes：
10baseT/Half 10baseT/Full
100baseT/Half 100baseT/Full
Supports auto-negotiation: Yes
Advertised link modes: 10baseT/Half 10baseT/Ful1
100baseT/Half 100baseT/Ful1
Advertised auto-negotiation: Yes
Speed: 100Mb/s

9I
8I
Duplex: Ful1
Port:MII
PHYAD:1
Transceiver: internal
Auto-negotiation:on
Supports Wake-on:pumbg
Wake-on: d
Current message level: 0x00000001 （1）
Link detected: yes
24 # ethtool eth1
26 Settings for ethl：
Supported ports： ［ TP MII ］
Supported link modes：
10baseT/Half 10baseT/Ful1
100baseT/Half 100baseT/Fu11
Supports auto-negotiation: Yes
Advertised link modes: 10baseT/Half 10baseT/Fu11
100baseT/Half 100baseT/Fu11
Advertised auto-negotiation: Yes
Speed: 100Mb/s
Duplex: Full
Port:MII
PHYAD:32
Transceiver: internal
Auto-negotiation:on
Supports Wake-on: pumbg
Wake-on: d
Current message level: 0x00000007 （7）
Link detected: yes
To quickly check whether your kernel supports bonding, run：

```bash
# grep ifenslave /sbin/ifup
```

```bash
# which ifenslave
```
/sbin/ifenslave


### 7.3. 网口绑定的模块参数

绑定模块参数控制了绑定的各个方面。
基于传输哈希策略，流出流量会被映射到不同的从属接口。建议您将
xmit_hash_policy 选项设置为适合绑定的layer3+4。该策略会获得上层协议信
息，如果能获得的话，然后基于这些信息生成哈希。这样流向特定网络端口的流量会跨
越多个从属端口，虽然单个连接不会跨越到多个从属端口。
s xmit_
_hash_policy=layer3+4
miimon 选项使得用户可以监控链路状态（该参数是以毫秒为单位的时间间隔）。
它使得单接口故障变得透明，从而在单链路发生故时，避免网络发生严重的退化。一个
合理的默认设定是100毫秒：
s miimon=100
对于较忙碌的网络，可适当增加延时。

### 7.4. 设置绑定

设置绑定的步骤如下：
1. 通过创建一个配置文件来创建一个虚拟的绑定端口：

```bash
# vi /etc/sysconfig/network-scripts/ifcfg-bond0
```
2. 将以下内容写入文件末尾：
DEVICE=bondO IPADDR=192.168.10.79 # Use the free IP Address
of your network NETWORK=192.168.10.0 NETMASK=255.255.255.0
USERCTL=no BOOTPROTO=none ONBOOT=yes
3. 将一个或多个从属端口加入到绑定端口里。更新 etho和 ethl 的配置文件（使用VI
文本编辑器）。
2. 用 VI文本编辑器打开ethO配置文件。

```bash
# vi /etc/sysconfig/network-scripts/ifcfg-eth0
```
b. 修改ethO文件，或追加以下内容：
DEVICE=ethO USERCTL=no ONBOOT=yes MASTER=bondO SLAVE=yes
BOOTPROTO=none
c.用VI 文本编辑器打开eth1配置文件。


```bash
# vi /etc/sysconfig/network-scripts/ifcfg-eth1
```
d. 修改 ethl 文件，或追加以下内容：
DEVICE=eth1
BOOTPROTO=none
USERCTL=nO ONBOOT=yes MASTER=bondO SLAVE=yes
4. 在配置文件/etc/modprobe.d/bond.conf 中设置绑定端口和其选项。照常启
动从属端口。

```bash
# vi /etc/modprobe.d/bond.conf
```
a.在文件末尾写入：
alias bondo bonding options bond0 mode=balance-alb
miimon=100
b. 加载绑定模块：

```bash
# modprobe bonding # ifconfig bondo up # ifenslave bond0
```
ethO
eth1
5. 启动或重启从属端口。
注意：必须用 modprobe 命令为每个被绑定的端口加载绑定模块。如果需要创
建bondo和bond1，那么两者都必须在bond.conf中进行配置。
以下的例子来自于运行 Red Hat Enterprise Linux 的系统。可以通过允许
/etc/sysconfig/networking-scripts/ifcfg-*脚本进行配置。下面的网站详
细介绍了其他的配置方法，如何用DHCP进行绑定，以及其他的设置细节。我们强烈建
议参考这个网站。
https://wiki.linuxfoundation.org/networking/bonding
6. 查看/proc/net/bonding文件，以确定绑定状态。每个绑定端口都应该对应该
目录下的一个文件：
：# cat /proc/net/bonding/bondO Ethernet Channel Bonding Driver: v3.0.3 （March 23，
Bonding Mode: load balancing （round-robin） MII Status: up MIl Polling Interval （ms）：0
Up Delay （ms）： 0 Down Delay （ms）：0
Slave Interface: ethO MII Status: up Link Failure Count: 0 Permanent HW addr: 4c：
00:10:ac:61:e0
Slave Interface: eth1 MII Status: up Link Failure Count: 0 Permanent HW addr: 00:14:2a：
7c:40:1d'、

7. 通过ethtoo1或ifconfig查看端口状态，第一个绑定的端口为bond。
'# ifconfig bondo Link encap:Ethernet HWaddr 4C: 00:10:AC: 61:EO inet addr：

### 192.168.10.79 Bcast: 192.168.10.255 Mask:255.255.255.0 inet6 addr: fe80：：4€00:10ff:feac：

61e0/64 Scope:Link UP BROADCAST RUNNING MASTER MULTICAST MTU:1500 Met-
ric:1 RX packets:3091 errors:0 dropped:0 overruns:0 frame:0TX packets:880 errors:0 dropped：
0 overruns:0 carrier:0 collisions:0 txqueuelen:0 Rx bytes:314203 （306.8 KiB） TX bytes:129834
（126.7 KiB）
ethO Link encap: Ethernet HWaddr 4C:00:10:AC: 61:EO inet6 addr: fe80：：4e00:10ff:feac：
61e0/64 Scope:Link UP BROADCAST RUNNING SLAVE MULTICAST MTU: 1500 Metric：
1 RX packets: 1581 errors:0 dropped:0 overruns:0 frame:0 TX packets:448 errors:0 dropped：
0 overruns:0 carrier:0 collisions: 0 txqueuelen: 1000 RX bytes: 162084 （158.2 KiB） TX bytes：
67245 （65.6 KiB） Interrupt:193 Base address:0x8c00
ethl Link encap:Ethernet HWaddr 4C:00:10:AC:61:EO inet6 addr: fe80：：4e00:10ff:feac：
61e0/64 Scope:Link UP BROADCAST RUNNING SLAVE MULTICAST MTU: 1500 Metric：
1 RX packets: 1513 errors:0 dropped:0 overruns:0 frame:0TX packets:444 errors: 0 dropped：
0 overruns:0 carrier:0 collisions: 0 txqueuelen:1000 RX bytes: 152299 （148.7 KiB） TX bytes：
64517 （63.0 KiB） Interrupt: 185 Base address:0x6000：'

### 7.4.1.示例

以下例子显示了bond.conf中绑定以太网端口eth1和eth2到bondO的条目：
1 # cat /etc/modprobe.d/bond.conf
2 alias eth0 8139too
3 alias ethl via-rhine
4 alias bondo bonding
5 options bondO mode=balance-alb miimon=100
7 # cat /etc/sysconfig/network-scripts/ifcfg-bondO
8 DEVICF=bondO
9 BOOTPROTO=none
10 NETMASK=255.255.255.0
11 IPADDR=192.168.10.79 #
（Assign here the IP of the bonded interface.）
12 ONBOOT=yes
13 USERCTL=no
15 ifcfg-ethx

16 # cat /etc/sysconfig/network-scripts/ifcfgetho
17 TYPE-Ethernet
18 DEVICE-ethO
19 HWADDR=4c: 00:10:ac: 61：€0
20 BOOTPROTO-none
21 ONBOOT-yes
22 USERCTL-no
23 IPV6INIT-nO
24 PEERDNS=yes
25 MASTER=bondO
26 SIAVE=yes
以下例子中，bondo为主端口（MASTER），etho和eth1从属端口 （SLAVE）。
注意：bond0的所有从属端口的 MAC 地址（Hwaddr） 相同，TLB 和ALB 下的每
个从属端口的 MAC地址必须是唯一的，除此之外的其他所有模式共享此 MAC地址。
1 $ /sbin/ifconfig
3 bondo Link encap:EthernetHwaddr 00:CO:FO: 1F:37:B4
4 inet addr:XXX.XXX.XXX.YYY Bcast:Xxx.XXX.XXX.255 Mask:255.255.252.0
5 UP BROADCAST RUNNING MASTER MULTICAST MTU:1500 Metric:1
6 RX packets:7224794 errors: 0 dropped: 0 overruns: 0 frame:0
7 TX
packets:3286647 errors: 1 dropped: 0 overruns: 1 carrier:0
8 collisions:0 txqueuelen:0
10 ethO
Link encap:EthernetHwaddr 00:CO:FO:1F:37:B4
11 inet addr:XXX.XXX.XXX.YYY Bcast:XXX.XXX.XXX.255 Mask:255.255.252.0
12 UP BROADCAST RUNNING SLAVE MULTICAST MTU:1500 Metric:1
13 RX packets:3573025 errors:0 dropped:0 overruns: 0 frame:0
14 TX packets: 1643167 errors:1 dropped: 0 overruns: 1 carrier:0
15 col1isions:0 txqueuelen:100
16 Interrupt: 10 Base address: 0x1080
18 eth1
Link encap:EthernetHwaddr 00:CO:FO: 1F:37:B4
19 inet addr:XXX.XXX.XXX.YYY Bcast:XXX. XXX.XXX. 255 Mask:255.255.252.0
20 UP BROADCAST RUNNING SLAVE MULTICAST MTU: 1500 Metric:1
21 RX packets: 3651769 errors: 0 dropped: 0 overruns: 0 frame:0

22 TX packets:1643480 errors: 0 dropped:0 overruns: 0 carrier:0
23 col1isions: 0 txqueuelen: 100
24 Interrupt:9 Base address:0x1400

### 7.5. 为绑定配置 Lustre 文件系统

Lustre 软件使用绑定端口的IP 地址，不需要其他额外配置。绑定端口被看做普通的
TCP/I端口。必要时，可通过/etc/modprobe中的 Lustrenetworks参数指定bondO：
options lnet networks=tcp （bondO）

### 7.6. 关于绑定的参考资料

我们推荐参考下面的参考资料：

- Linux 内核源码树中的documentation/networking/bonding.txt

- http://inux-ip.net/html/ether-bonding.html。

- http://linux-ip.net/html/ether-bonding.html.

- Linux 基金会绑定网站：https://www.linuxfoundation.org/networking/bonding。该网
站包含大量文档，强烈推荐。该网站包含关于很多更复杂设置的解释，包括在绑
定中使用 DHCP。

## 第八章Lustre 软件系统安装


### 8.1. 准备安装 Lustre 软件

安装 Lustre 软件，您可以使用下载的软件包（RPM），或直接从源代码安装。本章
主要介绍如何安装 Lustre RPM 软件包。从源码安装 Lustre 的介绍不在本文档的范围内，
可以在其他地方找到。
可供下载的 Lustre RPM 软件包，都在当时的Linux 商用发行版上通过了测试。关于
每个版本的具体细节，请参看发布说明。

### 8.1.1.需要的软件

使用 RPM 安装 Lustre 软件，需要以下安装包：

- Lustre 服务器软件包。下表中列出了 Lustre2.9 EL7服务器所需的软件包，其中，
ver 指 Lustre 和 kernel 发行版本（例如2.9.0-1.e17），arch 指处理器架构（例
如x86_64）。这些安装包可在Lustre Releases目录中获得。

软件包
kernel-verlustre.arch | 带 Lustre 补丁的 Linux 内核|||（被称为 patched kernel） | | lustre-ver.arch | Lustre 软件

- Lustre 客户端软件包。下表中列出了Lustre2.9 EL7 客户端所需软件包。其中，ver
指Linux 发行版本（如3.6.18-348.1.1.e15）。这些安装包可在Lustre Releases目
录中获得。
软件包
说明
kmod-lustre-client-ver.arch 与不带 Lustre 补丁的 Linux 内核
匹配的内核模块
lustre-client-ver.arch
lustre-client-dkms-ver.arch
客户端命令行工具
kmod-lustre-client的替代者，客户端
RPM，含动态内核模块支持（DKMS）。
避免了每次内核更新都安装新的 RPM，
但需要客户端的完鳖构建环境。
注意：除非安装了 DKMS软件包，否则在 Lustre 客户端上运行的内核版本必须与正
在安装的kmod-lustre-client-ver软件包版本相同。如果在客户端上运行的内核与 Lustre
不兼容，则在使用 Lustre 文件系统软件之前，必须在客户端上安装兼容的内核。

- Lustre LNet 网络驱动器（LND）。下表列出了 Lustre 软件提供的 LND。
支持的网络类型 说明
TCP
InfiniBand 网络
gni
任何支持 TCP 通信的网络，包括GigE、10GigE 和 IPoIB。
OpenFabrics OFED （o2ib）
Gemini（Cray 公司的网络）

注意：在发行周期中，InfniBand 和 TCP 的Lustre LND会经常性地被测试，其他
LND 则由各自的所有者维护。

- 高可用软件。如必要的话，可安装第三方高可用软件。更多信息，请参考11.2节
为故障切换而准备 Lustre 文件系统。

- 可选软件包。Lustre Releases目录中所提供的可选软件包有（不同的操作系统和平
台各有不同）：

- kernel-debuginfo,kernel-debuginfo-common,lustre-debuginfo，
lustre-osd-ldiskfs-debuginfo： 所需软件包的调试符号和选项，用作故
障发现和解决。

- kernel-deve1：编译第三方模块（如网络驱动程序）所需的部分内核源码树。

- kernel-firmware： 针对Lustre 内核重新编译的标准 Red Hat Enterprise Linux 发
行版。

- kernel-headers：安装在/user/include下的头文件，用于编译用户空间的
与内核相关的代码。

- lustre-source: Lustre 软件源代码。

- perf、perf-debuginfo、python-perf、python-perf-debuginfo（推荐）：
配合Lustre 内核版本编译过的 Linux 性能分析工具。

### 8.1.2. 环境要求

在安装 Lustre 软件之前，请确保软件环境符合以下要求：

- （必要）在所有客户端上使用相同的用户 ID （UID）和组ID（GID）。如果需要使
用补充组，请参看41.1节，用户/组的上行调用（upcall），了解有关补充用户和
组缓存 upcall 的内容（identity_upcal1）。

- （推荐）为客户提供远程shell访问。建议赋子所有集群节点通过远程 shell访问
客户端的权限，以更好地利用 Lustre 配置和监视脚本。推荐使用 pdsh（Parallel
Distributed SHell），也可使用 SSH （Secure SHell）。

- （推荐）确保客户端时钟同步。Lustre 文件系统使用客户端时钟作为时间戳。如
果客户端之间的时钟不同步，则不同客户端访问时，文件将显示不同的时间戳。
时钟漂移也可能导致问题，例如，难以调试多节点问题及关联日志等依赖于时间
戳的事件。我们建议您使用网络时间协议（NTP）保持客户端和服务器时钟同步。
有关NTP 的更多信息，请参阅：http://www.ntp.org。

- （推荐）确保安全扩展（如 Novell AppArmor 安全系统）和网络包过滤工具不会干
扰 Lustre 正常运行。


### 8.2. Lustre 软件安装流程

注意：在安装Lustre 软件前，请备份所有的数据。Lustre 软件包含了对内核的修改，
它需要同存储设备进行交互，如果软件未正确安装、配置或管理，可能会导致安全问题
和数据丢失。
安装 Lustre 软件，请参照以下步骤：
1. 核实是否满足 Lustre 安装需求。

- 硬件需求，请查看第五章，Lustre 硬件配置要求和格式化选项。

- 软件需求，请查看上面8.1 节，准备安装Lustre 软件。
2. 从Lustre Releases目录下载适用于您平台的e2fsprogs的RPM。
3. 从Lustre Releases目录下载适用于您平台的 Lustre 服务器 RPM。
4. 在所有Lustre 服务器（MGS、MDS、OSS）上安装服务软件包及e2fsprogs软件
包。
a. 用root用户登录 Lustre 服务器。
b. 用yum命令安装软件包：

```bash
# yum --nogpgcheck instal1 pkg1.rpm pkg2.rpm ...
```
c. 核查软件包是否正确安装：

```bash
# rpm -qalegrep "lustrelwc" |sort
```
d. 重启服务器。
e. 在每个 Lustre 服务器上重复以上步骤。
5. 从Lustre Releases目录下载适用于您平台的 Lustre 客户端 RPMs。
6. Lustre 客户端上安装其客户端软件包。
注意：客户端上运行的内核版本必须与安装的 lustre-client-modules-ver 版本相同。
否则，在安装 Lustre 客户端软件包前必须安装兼容内核。
a. 用root用户登录 Lustre 客户端。
b. 用yum命令安装软件包：

```bash
# yum --nogpgcheck install pkgl.rpm pkg2.rpm
```
..•

c.核查软件包是否正确安装：

```bash
# rpm -qalegrep "lustrelkernel"|sort
```
d. 重启客户端。
e. 在每个 Lustre 客户端上重复以上步骤。

## 第九章配置 Lustre 网络（LNet）

本章介绍如何配置 Lustre 网络 （Lustre Networking,LNet），包含以下章节：

- 9.1. 通过1netct1配置 LNet

- 9.2. LNet 模块参数概述

- 9.3. 设置 Net 模块的networks参数

- 9.4. 设置 LNet 模块的ip2nets参数

- 9.5. 设置 LNet 模块的routes参数

- 9.6. 测试 LNet 配置

- 9.7. 配置路由检查器

- 9.8. LNet 选项的最佳实践
注意：配置 LNet 是可选的。如果使用1ct1 networkup命令加载LNet，它会使
用在系统上发现的首个 TCPAI 端口（ethoo）。如果这种网络配置就足够了，那么您不
需要配置 LNet。如果需要使用 Infiniband 或者多个以太网端口，您就需要配置 LNet 了。
在 Lustre 2.7中引入：lnetct1命令可以用来在没有启动任何网络之前初始化
好LNet。通过1netct1命令，可以在配置好 LNet 之后，追加网络端口。然而，如果
LNet 不是由1netct1初始化的，那么需要在使用Inetct1命令管理LNet 之前，运
行Inetct1 lnet configure命令。
在 Lustre 2.7中引入：动态 LNET 配置 （Dynamic LNet Configuration, DLC）还提
供了 C-API，可以用程序来配置 LNet。请参看第四十五章，LNet 配置的C-API。

### 9.1. 通过1netct1配置 LNet

通过modprobe加载 LNet 内核模块后，可通过Lnetct1工具进行初始化和配置。
一般来而言，Inetct1格式如下：
1 Inetct1 cmd subcmd ［options］
该工具可管理以下配置：

- 配置/清除配置 LNet


- 增加/移除/显示网络

- 增加/移除/显示路由

- 启用/禁用路由

- 配置路由缓冲池

### 9.1.1. 配置 LNet

通过modprobe加载 LNet 后，可使用1netct1工具进行配置，而无需后动模块参
数中指定的网络。通过指定-a11选项，Inetct1工具可用来配置模块参数中指定的网
络端口。
1 Inetct1 Inet configure ［--al1］
2 #--al1: load NI configuration from module parameters
lnetct1工具也可用来清除LNet 的配置。
1 Inetct1 lnet unconfigure

### 9.1.2. 显示全局设置

使用如下Lnetct1命令，显示活动的 LNet 全局设置：
1 Inetct1 global show
如：
1 # Inetct1 global show
global：
numa_range:0
max_intf:200
discovery: 1
drop_asym_route: 0

### 9.1.3. 添加、删除、显示网络

在加载LNet 内核模块后，可添加、删除、显示网络。
Inetctl net add 命令用来添加网络：
1 lnetctl net add: add a network
--net: net name （ex tcpO）
--if:physical interface （ex ethO）
--peer
timeout: time to wait before declaring
a peer dead

--peer_credits: defines the max nunber of inflight messages
--peer_ buffer_credits: the number of buffer credits per peer
--credits: Network Interface credits
--apts: CPU Partitions configured net uses
--help: display this help text
11 Example：
12 lnetctl net add --net tcp2 --if ethO
--peer_timeout 180 --peer_credits 8
注意：Lustre 2.10中新增了基于软件的多轨功能（Software based Multi-Rail），应注
意：

- --net：不再是独一无二的，因为可以将多个网络端口添加到同一个网络中；

- --1f：每个端口只能向同一个网络添加一次，但可以为每个节点指定多个端口
（逗号分隔），如：ethO,ethl,eth2。
关于通过1netct1 net add或/和 YAML 添加多个网络端口的方法，请参看 16.2
节，多轨的配置。
Inetctl net del 命令用来删除网络：
1 net del: delete a network
--net: net name （ex tcpO）
--if： physical inerface （e.g. ethO）
5 Example：
6 Inetctl net del --net tcp2
注意：在软件多轨配置中，单独使用--net参数会删除整个网络及其包含的所有端
口。如果要删除特定的端口，可使用--1f配合--net。
Inetctl net show 命令用来显示所有或者部分配置好的网络，--verbose用于指定
是否显示详细信息。
1 net show: show networks
--net:net name （ex tcpO） to filter on
--verbose: display detailed output per network
5 Examples：
6 lnetctl net show
7 lnetctl net show
--verbose

8 Inetctl net show --net tcp2 --verbose
以下分别显示了网络配置的简略版和详细版。
1 # non-detailed show
2 > Inetct1 net show --net tcp2
3 net：
- nid: 192.168.205.130etcp2
status: up
interfaces：
0:eth3
9 #detailed show
10 > Inetct1 net show --net tcp2 --verbose
11 net：
8I
- nid: 192.168.205.130etcp2
status: up
interfaces：
0:eth3
tunables：
peer_timeout:180
peer_credits: 8
peer_buffer_credits: 0
credits: 256

### 9.1.4. 手动添加、删除、显示端点

Inetctl peer add 命令用于向软件多轨配置中手动添加远程端点。配置端点时，
--Prim_nid选项用于指定端点的主 NID，--nid选项用于指定由逗号分割的一串NID。
在 Lustre 2.11.0版本中加入了动态端点发现（Dynamic Peer Discovery）功能，关于这个
功能，请参看9.1.5，端点的动态发现。
1 peer add: add a peer
--prim_nid: primary NID of the peer
--nid: comma separated list of peer nids （e.g. 10.1.1.2@tcp0）
--non mr: if specified this interface is created as
a non
mulit-rail
capable peer. Only one NID can be specified in this case.

如：
1 Inetctl peer add
--prim_ nid 10.10.10.2etcp
--nid 10.10.3.30tcp1,10.4.4.5etcp2
也可不指定--prim-nid的值（端点的主 NID）。这时，--nid选项中列出的第一
个NID 即为该端点的主 NID。如：
Inetct1 peer_add --nid 10.10.10.2etcp,10.10.3.3@tcp1,10.4.4.5@tcp2
YAML 也可用于配置端点：
1 peer：
- primary nid： <key or primary nio
Multi-Rail:True
peer ni：
- nid: nid 1>
- nid： <nid 2>
- nid: nid n
配合使用其他命令，Inetct1 peer show命令的结果可用来收集信息，从而用于
协助端点的配置或删除。
Inetctl peer show -v
输出结果的一个例子如下：
1 peer：
bI
- primary nid: 192.168.122.218@tcp
Multi-Rail: True
peer ni：
- nid: 192.168.122.218@tcp
state: NA
max_ni_tx_credits: 8
available_tx_credits: 8
available_rtr_credits: 8
min_rtr_credits： -1
tx_q num of buf:0
send_count: 6819
recv_count: 6264
drop_count:0
refcount: 1
- nid: 192.168.122.78@tcp

6l
EZ
9z
state: NA
max_ni_tx_credits: 8
available_tx_credits: 8
available_rtr_credits: 8
min_rtr_credits： -1
tx_9.num_of_ buf:0
send_count: 7061
recv_count:6273
drop_count: 0
refcount: 1
- nid: 192.168.122.96etcp
state: NA
max_ni_tx_credits: 8
available_tx_credits: 8
available_rtr_credits: 8
min_rtr_credits：-1
tx_9_num_of buf:0
send_count: 6939
recv_count:6286
drop_count:0
refcount: 1
使用lnetct1命令删除端点：
1 peer del: delete a peer
--prim_nid: Primary NID of the peer
--nid: comma separated 1ist of peer nids （e.g. 10.1.1.2etcp0）
prim_nid参数总是需要指定。它用来确定要删除的端点。如果只有prim_nid参
数被指定，那么整个端点都会被删除。
下面是删除端点10.10.10.3etcp的单个 NID 的例子：
Inetct1 peer del --prim_nid 10.10.10.2etcp --nid

### 10.10.10.3@tcp

下面是删除整个端点的例子：
Inetct1 peer del --prim_nid 10.10.10.2etcp

### 9.1.5. 端点的动态发现（Lustre 2.11中引入）



### 9.1.5.1.概述 动态发现（Dynamic Discovery,DD）是一种让节点能动态发现端点，而

无需显式配置的功能。这对于配置多轨（Multi-Rail,MR）非常有用。在大型集群中，
可能有数百个节点，在每个节点上配置一遍MR端点容易出错。动态发现默认为启用状
态，它使用一种新的基于 LNet ping 的协议，在第一条消息中就能发现远程端点的端口。

### 9.1.5.2. 协议 当节点上的LNet 被要求向某端点发送消息时，它将首先尝试 ping 该端

点。对ping的应答包含端点的NID，以及描述该端点支持哪些功能的比特位。动态发现
功能为多轨功能增加了一个比特位。如果端点支持多轨功能，它会在对 ping 的应答设置
MR 比特位。节点收到应答后，会检查 MR 比特位，如果MR 比特位被设置，则使用新
的PUT 消息将自己的NID 列表推送到端点，这个消息被称为Push Ping。在这个简短的
协议完成之后，本节点和端点都将知晓彼此的端口列表。MR算法在随后就使用相应端
点的端口列表了。
如果端点不支持MR 功能，就不会在 ping应答中设置MR功能比特位。通过查看
ping 应答，节点将获悉端点不具备 MR功能，随后就仅会使用上层协议所提供的端口发
送消息。

### 9.1.5.3.动态发现和用户空间配置 即使动态发现运行，仍可手动配置端点。手动的端

点配置始终优先于动态发现，如果手动配置和动态发现的信息之间存在差异，则会打印
一条警告信息。

### 9.1.5.4. 配置 动态发现在配置方面非常轻巧。只能打开或关闭，命令如下：

1 Inetct1 set discovery ［0 | 1］
查看当前discovery设置，请使用Inetct1 global show命令，具体请参看

### 9.1.2 节，显示全局设置。


### 9.1.5.5. 根据需要初始化动态发现协议 可以根据需要初始化动态发现协议，而无需等

待与端点的通信：
1 Inetctl discover peer_nid ［ peer_nid.•.］

### 9.1.6. 添加、删除和显示路由

可通过添加一组路由来指示 LNet 消息如何选择路由：
1 Inetct1 route add: add a route
--net: net name （ex tapO） INet message is destined to.
The can not be a local network.
--gateway: gateway node nid （ex 10.1.1.2etcp） to route

11 Example：
all INet messaged destined for the identified
network
--hop: number of hops to final destination
（1 <hops <255）
--priority: priority of route （0 - highest prio）
12 lnetct1 route add --net tap2 --gateway 192.168.205.130etcp1 --hop 2 --prio 1
Inetct1命令用于删除路由：
1 Inetct1 route del: delete a route
--net: net name（ex tcpO）
--gateway: gateway nid （ex 10.1.1.2etcp）
例如：
1 Inetctl route del --net tcp2 --gateway 192.168.205.130etcp1
Inetct1命令用于显示配置好的路由：
1 Inetct1 route show: show routes
--net:net name （ex tcpO） to filter on
--gateway: gateway nid （ex 10.1.1.2@tcp） to filter on
--hop: number of hops to final destination
（1 < hops < 255） to filter on
--priority: priority of route （0 - highest prio）
to filter on
--verbose: display detailed output per route
例如：
1 # non-detailed show
2 Lnetctl route show
4 # detailed show
5 lnetctl route show --verbose
使用--verbose选项可显示更详细的信息。所有的信息显示和错误提示皆为
YAML 格式。以下为简略版和详细版：
1 #Non-detailed output
2 > Inetctl route show

3 route：
- net:tcp2
gateway: 192.168.205.130etcp1
7 #detai led output
8 > Inetctl route show --verbose
9 route：
- net:tcp2
gateway: 192.168.205.130@tcp1
hop: 2
priority: 1
state: down

### 9.1.7. 启用和禁用路由

当一个 LNet 节点被配置为路由器时，LNet 转发那些不指向自己的消息。该功能可
通过以下命令启用或禁用：
1 Lnetct1 set routing ［0 | 1］
2 #0 - disable routing feature
3 #1 - enable routing feature

### 9.1.8.显示路由信息

在节点上启用路由时，会分配微型、小型和大型路由缓冲区。请参看34.3节，LNet
参数调试。相关信息可通过如下命令进行查看：
1 Inetctl routing show: show routing information
3 Example：
4 Inetct1 routing show
输出如下：
1 > Inetctl routing show
2 routing：
- cpt［O］：
tiny：
npages:0
nbuffers：

1I
credits: 2048
mincredits: 2048
smal1：
npages: 1
nbuffers:16384
credits: 16384
mincredits: 16384
large：
npages: 256
nbuffers: 1024
credits:1024
mincredits: 1024
- enable: 1

### 9.1.9. 配置路由缓冲

配置的路由缓冲区数值指定了微型、小型和大型路由缓冲区各组中的缓冲区数量。
很多时候，需要将微型、小型和大型路由缓冲区的数量配置为默认值之外的某些
值。这些值是全局值，设置后，它们将用于所有已配置的CPU 分区。如果路由已启用，
那么设置的值将立即生效。如果指定了更多的缓冲区，那么会分配缓冲区以满足配置更
改；如果指定了较少的缓冲区，那么就会在缓冲区停止使用时将其释放。如果路由尚未
配置，则无法更改该值。缓冲区数量在在路由关闭或打开时会重置为默认值。
Inetct1 set命令用于设置缓冲区数目。当设置的数值比0大时，会相应地设置缓
冲区数量。当该值为0时，则会将缓冲区数量重置为默认值。
1 set tiny buffers：
set tiny routing buffers
VALUE must be greater than or equal to 0
5 set smal1_ buffers: set sma11 routing buffers
VALUE must be greater than or equal to 0
8 set large_ buffers: set large routing buffers
VALUE must be greater than or equal to 0
例如：
1 > Inetct1 set tiny buffers 4096
2 > Inetct1 set smal1_buffers 8192

3 > Inetctl set large_buffers 2048
缓冲区数量可以按下面这样重置为默认值：
1 > Inetctl set tiny buffers O
2 > Inetct1 set small_buffers 0
3 > Inetctl set large buffers

### 9.1.10. 非对称路由（Lustre 2.13 引入）


### 9.1.10.1.概述 非对称路由（Asymmetrical Route）是指来，自远程端点的一个消息，它

通过某个路由器传输到本节点，但是本节点在向该远程端点传输消息时，却不会使用该
路由器。
在调试网络时，非对称路由可能会引发问题。而允许非对称路由也会给攻击打开大
门，恶意的客户端可能会通过非对称路由向服务器注入数据。
因此，可以打开LNet 的一个检查，它能检测到所有来自非对称路由的消息，并将
其丢弃。

### 9.1.10.2. 配置 打开或关闭非对称路由检测，可以使用如下命令：

1 Inetct1 set drop_asyn_route ［0 1 1］
该命令以节点为单位工作。意思就是，Lustre 群集中的每个节点都可以自行决定是
否接受非对称路由消息。
要想检查当前的drop_asym_route设置，可使用1netct1 global show命令。
请参看9.1.2 节，显示全局设置。
默认情况下，非对称路由检测处于关闭状态。

### 9.1.11. 引入 YAML 配置文件

对LNet 的配置可以使用 YAML格式描述，输入给1netct1工具。lnetct1工具会
解析 YAML 文件，然后对其中描述的各个条目，执行指定的操作。如果命令像下面那
样，未定义任何操作，则执行默认操作add。YAML 的语法将在后面章节介绍。
1 Lnetct1 import FILE.yaml
2 Inetct1 import < FIIE.yaml
lnetct1 import命令提供了三个可选参数来指定要在 YAML 文件中描述的条目
上执行哪个操作。
1 # 如果命令没有指定选项，默认执行“”操作add
2 Inetct1 import --add FILE.yaml

3 Inetct1 import--add < FILE.yaml
5 # 删除文件中描述的所有条目YAML
6 Inetct1 import --del FILE.yaml
7 Inetctl import --del < FILE.yaml
9 #显示文件中描述的所有条目YAML
10 Inetct1 import --show FIIE.yaml
11 Inetct1 import --show <FILE.yaml

### 9.1.12.导出 YAMIL 配置文件

Inetct1 export命令用于将配置以 YAML格式导出。
1 Inetct1 export FILE.yaml
2 Inetct1 export > FILE.yaml

### 9.1.13. 显示 LNet 流量数据信息

Inetct1工具可通过以下命令打印出 LNet 通信的统计信息：
1 Inetct1 stats show

### 9.1.14. YAML 的语法

Inetct1实用程序可导入 YAML 文件，并在其中描述的条目上执行添加、删除或
显示三种操作之一：。
如下述章节所述，网络、路由和路由表的YAML块都可定义为YAML 序列。每个
序列带一个seq_no字段。在返回的错误块中也会有seq_no字段。这样调用者可以把错
误对应到导致错误发生的条目。lnetct1工具会尽最大努力配置YAML文件中定义的
条目，在遇到首个错误时不会停止处理文件。
以下就是YAML 的语法，描述了可以通过DLC操作的各种配置元素。不是所有
YAML 元素对每种操作（添加/删除/显示）都是必须的。系统将忽略与请求的操作无关
的元素。
1 net：
- net： <network. Ex:top or o2ib
interfaces：
0： <physical interface

bI
detail： <This is only applicable for show comnand. 1 - output
detailed info. 0 - basic output
tunables：
peer_timeout： <Integer. Timeout before consider a peer dead
peer_credits：<Integer. Transmit credits for a peer>
peer_buffer_credits： <Integer. Credits available for receiving
messages>
credits： <Integer. Network Interface credits
SMP： <An array of integers of the for： "［x, Y•..］"， where each
integer represents the CPT to associate the network interface
with> seq_no： <integer. Optional. User generated, and is
passed back in the YAML errOr block>
seq_no字段和详细信息字段都没有在输出中显示。
1 routing：
- tiny： <Integer. Tiny buffers
smal1：<Integer. Sma11 buffers
large：<Integer. Large buffers
enable： <0 - disable routing. 1 - enable routing
seq_no： <Integer. Optional. User generated, and is passed back in
the YAML error block
seq_no字段没有在输出中显示。
1 statistics：
seq_no： <Integer. Optional. User generated, and is passed back in the
YAML error block>
seq_no字段没有在输出中显示。
1 route：
- net： <network. Ex: tcp or o2ib>
gateway： <nid of the gateway in the form <ip>@<net>： Ex：

### 192.168.29.1@tcp>


hop： <an integer between 1 and 255. Optional>
detail： <This is only applicable for show commands. 1 - output
detai led info. 0.basic output
seq_no： <integer. Optional. User generated, and is passed back in the
YAML error block
seq_no字段和详细信息字段都没有在输出中显示。

### 9.2. LNet 模块参数概述

LNet 内核模块参数指定了如何配置 LNet 以配合Lustre 运行，其中包括了应配置哪
些NIC 给Lustre 使用，Lustre 使用哪个路由等。
LNet 的参数一般保存在/etc/modprobe.d/lustre.conf文件中。有些情况下，
这些参数可能存储在/etc/modprobe.conf文件中，但自 RHELS 和 SLES10后，这种
用法就弃置了，而使用单独的/etc/modprobe.d/lustre.conf文件，简化了 Lustre
网络配置的管理和分发。该文件包含一个或多个条目，每个条目语法如下：
1 options Inet parameter=value
要想指定 Lustre 应该使用哪个网络端口，那就要么设置networks参数，要么设
置ip2nets参数（一次只能使用其中之一）：

- networks：指定 Lustre 使用的网络。

- ip2nets：列出所有全局可用的网络，每个网络对应一个『地址范围。LNet 通过
地址列表的匹配查找来识别本机可用的网络。
更多细节，请查看9.3节，设置 LNet 模块的networks参数和9.4节，设置 LNet
模块的ip2nets参数。
要想设置网络间的路由，那就使用：

- routes：列出网络，以及通过哪些 NID 转发到这些网络。
更多细节，请查看9.5节，设置 LNet 模块的routes参数
可通过配置路由器检查程序，启用 Lustre 节点上的路由器运行状况检测功能，从而
绕过看上去死机的路由节点，然后在故障修复后重新恢复使用这些路由节点。
完整的路由模块参数，请参看第四十三章，配置文件和模块参数。
注意
建议您使用IP 地址而不是主机名，以便更轻松地读取调试日志并使用多个端口调
试配置。


### 9.2.1.使用 Lustre 网络标识符（NID）来标识节点

Lustre 网络标识符（NID）可以唯一地标识Lustre 网络端点，它包含节点ID 和网络
类型。NID 的格式为：
1 network_idenetwork_type
例如：
1 10.67.73.200etcpo
2 10.67.75.1008o2ib
第一项标识了一个 TCP/IP 节点，第二项标识了一个 InfiniBand 节点。
当在客户端上运行mount命令时，客户端通过MDS 的NID来检索配置信息。如果
该 MIDS 具有多个 NID，则客户端应为其本地网络选用适当的 NID。
想要确认哪个 NID 适合用在mount命令中，可以使用1ct1命令。想要列出MDS的
所有 NID，请在MDS上运行：
1 lct1 list_nids
想要确认客户端是否能通过给定的 NID 连接到 MDS，可以在客户端上运行：
1 1ct1 which_nid MDS_NID

### 9.3. 设置 LNet 模块的networks参数

如果一个节点有多个网络端口，那么您通常需要为Lustre 指定一个专用端口。可
在1ustre.conf 文件中添加一条设置LNet 模块的networks参数的条目。
1 options Inet networks=comma-separated 1ist of
networks
下面的例子指定让 Lustre 节点使用一个 TCP/IP 端口和一个 InfiniBand 端口：
1 options lnet networks-tcpO （ethO）， o2ib （ib0）
下面的例子指定让 Lustre 节点使用TCP/IP 端口eth1：
1 options lnet networks=tcp0 （eth1）
根据不同的网络设计，可能需要为Lustre 明确指定网络的端口。例如，以下命令中，
明确指定了网络tcp0使用端口eth2、网络tcp1使用端口eth3：
1 options Inet networks=tcp0 （eth2），tcp1 （eth3）

当网络启动期间有多个端口可用时，Lustre 会根据跳数选择最佳路由。一旦网络连
接建立，Lustre 将期望网络保持连接。在Lustre 网络中，即使同一节点上有多个端口可
用，网络连接在发生故障时，也不会将路由切换至另一端口。
注意：1ustre.conf 中的LNet 条目仅决定了本机节点用哪个名字称呼它的端口，
而不影响路由决策。

### 9.3.1.多地址服务器的例子

当一个具有多个IP地址的服务器（多地址服务器，Multihome Server）连入 Lustre
网络时，需要设置一些配置。下面的例子中，网络包含了以下节点：

- 服务器 sv:l，三个 TCP 网卡（etho、eth1和eth2） 和一个 InfiniBand 网卡。

- 服务器 svt2，三个 TCP 网卡（ethO、eth1和eth2）和一个 InfiniBand 网卡。其
中，端口eth2不用于Lustre 网络。

- TCP 客户端，每个客户端有一个单独的TCP 端口。

- InfiniBand 客户端，每个客户端有一个单独的Infiniband 端口以及一个用于管理的
TCP/IP 端口。
在这个例子中，设置 networks选项：

- 在每个服务器，（即svr1和 svr2）的lustre.conf文件中添加：
1 options Inet networks-topO （ethO），tcp1（eth1），02ib

- 对于 TCP 客户端来说，第一个非回送地址的IP 端口自动被用于tcpO。因此，只
有一个端口的TCP 客户端无需在1ustre.conf文件中定义选项。

- 在 InfiniBand 客户端的lustre.conf文件中添加：
1 options lnet networks-o2ib
注意：在默认情况下，Lustre 将忽略回送端口 （loopback,100）。然而，Lustre 不会
忽略回送端口的别名 IP地址。因此，如果您为回送端口设置了别名IP地址，您必须使
用 LNet 的networks参数指定所使用的Lustre 网络。
注意：如果服务器在同一子网上有多个网络端口，那么 Linux 内核将使用配置第一
个的端口发送所有流量（受限于 Linux 而不是 Lustre）。在这种情况下，应使用网络端口
绑定。更多关于网络端口绑定的信息，请参看第七章，绑定网络端口的设置。


### 9.4. 设置 LNet 模块的ip2nets参数

使用ip2nets选项的场景通常是，在所有服务器和客户端上使用单个全局通用
的1ustre.conf文件。每个节点会用其中的IP 地址模式列表匹配本节点的本地IP地
址，从而找到本节点的可用网络。
请注意，ip2nets选项中列出的IP 地址模式仅仅用于标识每个节点应该使用哪些
网络。LNet 不会将其用于任何其他的通信目的。
例如，网络中的节点具有以下IP地址：

- 服务器 svtl:ethO的IP 地址为192.168.0.2,Infiniband （o2ib）上的IP地址
为132.6.1.2。

- 服务器svt2:ethO的IP 地址为192.168.0.4，Infiniband （o2ib）上的IP地址
为132.6.1.4。

- TCP 客户端的IP 地址为192.168.0.5-255。

- Infiniband 客户端Infiniband （o2ib）上的IP地址为132.6.［2-3］.2，•4，.6，
.8。
在每个客户端和服务器的1ustre.conf文件中添加：
1 options Inet 'ip2nets "tcpO （etho） 192.168.0.［2, 4］；\
2 tcp0 192.168.0.*； o2ib0 132.6.［1-3］.［2-8/2］"
ip2nets中的每一条命令相当于一条规则。
配置服务器时，LNet 条目的顺序很重要。如果一个服务器可通过多个网络访问，将
使用在1ustre.conf文件中指定的第一个网络。
如果svr1和svr2匹配第一条规则，则LNet 在这些机器上将使用eth0作
为tcpO。（即使sVr1和svr2也匹配第二条规则，仍使用匹配第一条规则的网络）。
［2-8/2］格式表示从2到8，以2为间隔逐步增加，即2、4、6、8。因此，客户
端132.6.3.5将找不到匹配的o2ib 网络。
在Lustre 2.10中引入，注意：多轨模式弃用了内核模块中对ip2nets的解析，转而
在用户空间中对ip2nets进行 IP 模式匹配，将之转换为网络端口，然后添加到系统中。
首个匹配该IP 模式的网络端口将被添加到网络中。
如果端口和 IP 模式两者都显式指定了，那么通过匹配 IP 模式得到的端口，将同显
式定义的端口进行比照。
例 如，tcp（etho）为192.168.*.3，而在系统中同时存在etho ==

### 192.158.19.3和 eth1 == 192.168.3.3，则该配置将会因模式匹配与指派的端

口相冲突而失败。
当出现配置不一致时，会清晰地打印警告信息。您可使用以下命令配置ip2nets：

lnetct1 import < ip2nets•Yaml
如：
1 ip2nets：
- net-spec: tcp1
interfaces：
0：etho
1:eth1
ip-range：
0:192.168.*.19
1:192.168.100.105
- net-spec:tcp2
interfaces：
0:eth2
ip-range：
0:192.168.*.*

### 9.5. 设置 LNet 模块的routes参数

LNet 模块的routes参数用于标识 Lustre 配置中的路由器，它们在每个 Lustre 节点
的modprobe.conf文件中进行配置。
设置routes的目的通常是用来连接相互隔离的子网，或者交叉连接两种不同类型
的网络，如 tcp 和 o2ib。
LNet 的routes参数指定一个路由节点列表，以冒号分隔。每项路由包含一个网络
号码，以及后面跟随的路由节点列表：
1 routes net_type router_NID（s）
下面的例子指定了双向路由，TCP 客户端可以访问IB 网络上的 Lustre 资源，IB服
务器也可以访问TCP网络：
1 options Inet'ip2nets="tcpO 192.168.0.*；\
o2ibo（ibO） 132.6.1.［1-128］"''routes="tcp0

### 132.6.1.［1-81@o2ib0；\

o2ib0 192.16.8.0.［1-8］@tcpo"'
桥接两个网络的所有LNet 路由节点都是等效的。它们中不存在主路由节点或备用
路由节点，流量负载在所有可用路由节点上均衡分布。
LNet路由节点的数量没有上限。应该配备足够数目的路由节点，以处理所需的文
件服务带宽，外加25%的动态余量。


### 9.5.1.路由配置示例

在客户端上的1ustre.conf文件中添加：
1 Inet networks-"tcp" routes-"o2ib0 192.168.0.［1-8］@topo"
在服务器节点上使用：
1 Inet networks="tcp o2ib" forwarding enabled
在MDS 节点上使用相反的路由：
1 Inet networks="o2ib0" routes="tap0 132.6.1.［1-8］@o2ib0"
启动路由服务运行：
1 modprobe Inet
2 lct1 network configure

### 9.6.测试 LNet 配置

在完成Lustre 网络配置后，强烈建议您使用Lustre 软件提供的 LNet Self-Test 来测
试您的 LNet 配置。关于使用 LNet Self-Test 的更多信息，请参看第三十二章，Lustre网
络性能测试 （LNet Self-Test）。

### 9.7.配置路由器检查器

如果在Lustre 配置中，不同类型的网络，如TCPAIP 网络和 Infiniband 网络，通过路
由节点进行连接，那么可以在客户端和服务器上运行路由节点检查器以监视路由器的状
态。在多跳路由配置中，可以在路由节点上配置路由节点检查器，从而监视其下一跳路
由节点的运行状况。
路由节点检查器的配置可通过在1ustre.conf中设置LNet 参数进行。添加的条目
格式如下：
1 options lnet
router_checker_parameter-value
路由节点检查器的参数包括：


- 1ive_router_check
_interva1：指定路由节点检查程序 ping 在线路由节点
的时间间隔（以秒为单位）。默认值为0，即不进行检查。将该值设置为60，请输
入：
1 options lnet live_router_check_interval=60

- dead_router_check.
_interva1：指定路由节点检查程序检查死亡路由节点的
时间间隔（以秒为单位）。默认值为0，即不进行检查。将该值设置力60，请输入：
1 options Inet dead_router_check_
_interval=60

- auto_down - 启用/禁用（1/0）路由节点状态的自动标记。默认值为1。要想禁用
路由器标记，请输入：
1 options Inet auto_down=0

- router_ping_timeout： 指定路由节点检查器在检查在线路由节点
或死亡路由节点时的超时时间。路由节点检查器分别在时间间隔
为dead
Lrouter_check_interval和1ive_router_check_interval内 给
在线路由节点或死亡路由节点发送一次 ping 消息。默认值为50。要将值设置
为60，请输人：
1 options Inet router_ping_timeout=60
注意：router_ping_timeout 与默认的LND超时一致。在大集群上，如果LND
超时增加，那么router_ping_timeout也必须增加。对于较大的群集，我们建议使
用较大的时间间隔。

- check_routers_before_use：指定是否在使用前检查路由节点。默认为off。
如果此参数设置为on，则dead_router_check_interva1的参数必须设置为
正整数。
1 options Inet check_routers before_use-on
路由节点检查器从每个路由器获得以下信息：


- 路由节点被禁用的时间点

- 路由节点被禁用的时间长度
如果router_ping_timeout时间内路由节点检查器未收到路由节点返回的消息，
则我们认为该路由节点为down状态。
如果一个路由节点被标记为up状态并能够响应ping，超时将被重置。
如果路由节点成功发送了100个数据包，则该路由节点的发送数据包计数器的值为
100。

### 9.8. LNet 选项的最佳实践

对于networks、ip2nets和routes选项，请参照以下实例以避免配置错误。

### 9.8.1.用引号逗号

在一些Linux 发行版中，逗号可能需要使用单引号或双引号进行转义。在某些特殊
情况下，options可能如下所示：
1 options
Inet'networks="tcp0,elan0"'
'routes="tcp ［2,10］@elano"'
添加的引号可能会造成一些Linux 发行版的困惑。以下的消息可能提示问题与添加
的引号相关：
1 Inet: Unknown parameter 'networks'
'Refusing connection - no matching NID'消息通常指向LNet 模块配置
错误。

### 9.8.2. 增加注释

在注释末尾使用分号来标记注释的结束。LNet 将会自动忽略#字符和下一个分号之
间的内容。
下面是一个错误的例子。LNet 将跳过pt11 192.168.0.［92,96］语句，导致这
些节点的初始化不正常，但不会打印任何错误消息。
1 options Inet ip2nets-"pt10 192.168.0.［89, 93］；# comment
with semicolon BEFORE comment \ pt11 192.168.0.［92, 96］；

正确的语法应为：
1 options lnet ip2nets-"pt10 192.168.0.［89, 93］\
2 # comment with semicolon AFTER comment；\
3 pt11 192.168.0.［92, 96］ # comment
请不要添加过多的注释。Linux 内核限制了模块选项中使用的字符串的长度（通常
为1KB，但不同供应商的内核可能会有所不同）。超过此限制则会导致错误，而指定的
配置也可能无法被正确处理。

## 第十章Lustre 文件系统配置


### 10.1. 配置简单的Lustre 文件系统

通过使用 Lustre 软件提供的管理实用程序，Lustre 文件系统可被设置为各种不同的
配置。以下是配置一个简单的 Lustre 文件系统（由一个 MGS/MDS 组合、一个 OSS带
两个 OST、一个客户端组成）的流程。
此配置过程假定您已完成以下任务：

- 设置并配置您的硬件

- 下载并安装 Lustre 软件
以下的可选步骤如必要，则应在配置Lustre 软件前完成：

- 在用作 OSTs或MDTs 的块设备上设置硬件或软件 RAID。

- 在以太网接口上设置网络接口绑定。

- 设置 Inet 模块参数用于指定 Lustre Networking （LNet）的配置以配合 Lustre 文件
系统工作，并测试 LNet 配置。默认情况下，LNet 将使用它在系统上发现的第一个
TCP /IP 接口。如果此网络配置足够，则不需要配置 LNet。如果您使用 InfiniBand
或多个以太网接口，则需要 LNet 配置。

- 运行基准测试脚本 sgpdd-survey以获得您的硬件基准性能。对您的硬件进行基
准测试可以简化与Lustre 软件无关的调试性能问题，并确保您在安装时获得最佳
性能。
注意

sgpdd-survey脚本会覆盖正在测试的设备，因此必须在配置 OST之前运行。
配置简单的 Lustre 文件系统，请完成以下步骤：
1. 在块设备上创建一个 MGS/MDT 组合文件系统。在 MDS 节点上运行：

```bash
mkfs.lustre --fsname= fsname --mgs --mdt --index=0
```
/dev/block_device
默认文件名（fsname）力 lustre。
注意
若您希望建立多个文件系统，则MGS 应在其专用的块设备上分别进行创建。运行
脚本为：
1•.

```bash
2 mkfs.lustre --fsname=
```
3 fsname --mgs
4 /dev/block_device
2. 可选增加附加的MDTs：

```bash
1 mkfs.lustre --fsname-
```
2 Esname --mgsnode-
3 nid --ndt --index=1
4 /dev/block_device
注意
最多可附加 4095个 MDTs。
3. 在块设备上装入 MGS/MDT 组合文件系统。在MDS 节点上运行：

```bash
mount -t lustre /dev/block_device /mount_point
```
注意
如您已在不同块设备上创建 MGS 和MIDT，则须同时装入它们。
4. 创建 OST，在OSS 节点上运行：

```bash
1 mkfs.lustre --fsname-
```
2 fsname --mgsnode-

3 MGS_NID --ost --index-
4 0ST_index
5 /dev/block_device
当您创建 OST 时，块存储设备上的ldiskts 或 ZFS 文件系统将被格式化（正如使用
本地文件系统一样）。
只要硬件或驱动程序允许，每个 OSS 可以有足够多的 OST。
每个块设备只能配置一个 OST。创建 OST 时，应使用未分区的原始块设备。
您应在格式化时指定 OST 索引编号，以便于简化从错误消息或文件条带化中的
OST 编号转换力 OSS 节点和块设备的过程。
如您使用了可从多个 OsS 节点访问的块设备，请确保一次只从一个OSS节点载入
OST。我们强烈建议您为这些设备启用多载保护，以避免严重的数据损坏。
注意
Lustre 软件在 Red hat 企业版的Linux 5和6上目前支持高达128TB 大小的块设备
（在其他发行版上刻支持高达8TB 大小的块设备）。如果设备大小仅略大于 16 TB，
建议您在格式化时将文件系统大小限制为16 TB。我们建议您不要将 DOS 分区置
于RAID 5/6块设备之上，因为它会对性能产生负面影响。因此，更保险的做法是
格式化整个磁盘。
5. 装入 OST。在创建 OST的 OSS 节点上运行：

```bash
1 mount -t lustre
```
2 /dev/block_device
3 /mount_point
注意
创建附加的 OSTs，请重复步骤4及步骤5并指定下个 OST 索引编号。
6. 在客户端上装入Lustre 文件系统，在客户端上运行：

```bash
1 mount -t lustre
```
2 MGS_node:/
3 Esname
4 /mount_point
注意
在附加的客户端上装入文件系统，请重复步骤6。

如您在装入文件系统时出错，请查看客户端和所有服务器上的系统日志并检查网
络配置。一个新安装系统的常见错误是 hosts.deny 或防火墙可能禁止了端口 988的
连接。
7. 通过在客户端上运行 Ifs df，dd，Is 命令，确认文件系统是否成功启动并在正常工
作中。
8.（可选）运行基准测试组件来验证集群中硬件层和软件层的性能。可用的工具包
括：
obdfilter-survey：指向 Lustre 文件系统的存储性能。
ost-survey： 对OST 执行I/O操作以检测其他相同磁盘子系统之间的异常情况。

### 10.1.1. 简单 Lustre配置示例

请按照此示例的步骤来完成简单的 Lustre 文件系统配置。其中，我们创建了 MGS/
MDT 组合和两个 OST 以构成名为temp 的文件系统；使用了三个块设备，一个用于
MGS/MDT 的组合节点，另两个用于 OsS 节点。以下列出了本示例中使用的通用参数以
及各个节点参数：
通用参数
值
说明
MGSnode

### 10.2.0.1@tcpo

file system
temp
network type TCP/IP
MGS/MDS 组合节点
Lustre 文件系统名
Lustre 文件系统 temp 的网络类型
节点参数
值
MGS/MDS 节点
MGS/MDS node mdtO
block device
/dev/sdb
mount point
/mnt/mdt
首个OSS 节点
OSS node
OST
Oss0
ostO
说明
Lustre 文件系统 temp 中的MDS
MGS/MIDS组合节点的块设备
MGS/MDS 节点块设备 mdtO （/dev/sdb）上的载入点
Lustre 文件系统 temp 中的首个 OSS 节点
Lustre 文件系统 temp 中的首个 OST 节点

节点参数
值
block device
mount point
第二个 OSS 节点
OSSnode
OST
block device
mount point
客户端节点
client node
mount point
/dev/sdc
/mnt/ostO
Oss1
ost1
/dev/sdd
/mnt/ost1
client1
/lustre
说明
首个 OSS 节点（ossO）的块设备
ossO 节点块设备 ostl （/dev/sdc）上的载入点
Lustre 文件系统 temp 中的第二个 OSS 节点
Lustre 文件系统 temp 中的第二个 OST 节点
第二个 OSS 节点（oss1）的块设备
oss1 节点块设备 ostl（/dev/sdc）上的载入点
Lustre 文件系统temp 中的客户端
客户端节点上Lustre 文件系统 temp 的载入点
注意
而不是主机名。
在本例中，请完成以下步骤：
增加调试日志的可读性并更方便为多个接口调试配置，我们建议您使用IP地址
1.在块设备上创建一个 MGS/MDT 组合文件系统。在MDS 节点上运行：

```bash
1 ［root @mds /］# mkfs.lustre --fsname=temp --mgs --mdt --index=0 /dev/sdb
```
该命令的输出为：
1 Permanent disk data：
2 Target：
3 Index：
temp-MDT0000
4 Lustre FS: temp
5 Mount type：
6 Flags：
ldiskfs
0x75
（MDT MGS first_time update ）
8 Persistent mount opts: errors=remount-ro,iopen_nopriv, user_xattr
9 Parameters: mdt.identity_upcall=/usr/sbin/1_getidentity

I1 checking for existing Liustre data: not found
12 device size = 16MB
13 26 18
14 formatting backing filesystem ldiskfs on /dev/sdb
target name
temp-MDTffff
4k blocks
options
-i 4096 -I 512 -9-0 dir_index,uninit_groups -F
18 mkfs_cnd = mkfs.ext2 -j -b 4096 -L temp-MDTffff -1 4096 -I 512 -9 -0
19 dir_index, uninit_groups -F /dev/sdb
20 Writing CONFIGS/mountdata
2. 在块设备上载入 MGS/MDT 组合文件系统。在MDS 节点上运行：

```bash
1 ［root@mds /］# mount -t lustre /dev/sdb mnt/mdt
```
该命令的输出为：
1 Lustre:temp-MDT0000:new disk, initializing
2 Lustre: 3009:0：（Lproc_mds.c:262:1procfs_wr_identity_upcal1（））temp-MDT0000：
3 group upcall set to /usr/sbin/1_getidentity
4 Lustre: temp-MDT0000.mdt: set parameter
identity_upcal1=/usr/sbin/1_getidentity
5 Lustre: Server temp-MDT0000 on device /dev/sdb has started
3. 创建并载入 ostO。
在本示例中，OSTs（ostO and ost1）在不同 OSS （ oss0 and oss1）节点上创建。
a. 在ossO 上创建 ostO：

```bash
1 ［root@ossO /］# mkfs.lustre --fsname=temp --mgsnode=10.2.0.1@tcp0 --ost
```
2 --index=0 /dev/sdc
该命令的输出为：
1 Permanent disk data：
2 Target：
temp-OST0000
3 Index：

4 Lustre ES:temp
5 Mount type：
ldiskfs
6 Flags：
0×72
7 （OST first_time update）
8 Persistent mount opts: errors=remount-ro,extents,mbal1oc
9 Parameters: mgsnode-10.2.0.1etcp
11 checking for existing Lustre data: not found
12 device size = 16MB
13 26 18
14 formatting backing filesystem ldiskfs on /dev/sdc
target name
temp-OST0000
4k blocks
options
-I 256 -9 -O dir_index,uninit_groups -F
18 mkfs_cnd = mkfs.ext2 -j -b 4096 -L temp-OST0000
-I 256 -9 -0
19 dir_index, uninit_groups -F /dev/sdc
20 Writing CONFIGS/mountdata
b.在OSS上载入 ostO，在 ossO上运行：

```bash
1 root@ossO /］ mount -t lustre /dev/sdc /mnt/ost0
```
该命令的输出为：
1 LDISKFS-fs: file extents enabled
2 LDISKFS-fs: mballoc enabled
3 Lustre: temp-OsT0000:new disk, initializing
4 Lustre: Server temp-OST0000 on device /dev/sdb has started
等候一小段时间后，显示如下：
1 Lustre: temp-OST0000: received MDs connection from 10.2.0.1@tcpO
2 Lustre: MDS temp-MDT0000: temp-OST0000_UUID now active, resetting orphans
4. 创建并载入 ostl。
a. 在oss1 上创建 ostl：


```bash
1 ［root@oss1 /］# mkfs.lustre --fsname=temp --mgsnode-10.2.0.1@tcp0 \
```
--ost --index=1 /dev/sdd
该命令的输出为：
1 Permanent disk data：
2 Target：
temp-OST0001
3 Index：
4 Lustre FS: temp
5 Mount type：
ldiskfs
6 Flags：
0x72
7 （OST first_time update）
8 Persistent mount opts: errors=remount-ro,extents,mballoc
9 Parameters: mgsnode=10.2.0.1@tcp
11 checking for existing Lustre data: not found
12 device size = 16MB
13 26 18
14 formatting backing filesystem ldiskfs on /dev/sdd
target name
temp-OST0001
4k blocks
options
-I 256 -9 -0 dir_index,uninit_groups -F
18 mkfS_cnd = mkfs.ext2 -j -b 4096 -L temp-OST0001 -I 256-g
19 dir_index, uninit_groups -F /dev/sdc
20 Writing CONFIGS/mountdata
b.在OSS上载入ostl，在 ossl 上运行：

```bash
1 root@oss1 /］ mount -t lustre /dev/sdd /mnt/ost1
```
该命令的输出为：
1 LDISKES-fs: file extents enabled
2 LDISKFS-fs: mballoc enabled
3 Lustre: temp-OST0000:new disk, initializing
4 Lustre: Server temp-OST0000 on device /dev/sdb has started
等候一小段时间后，显示如下：
1 Lustre: temp-OST0001: received MDS connection from 10.2.0.1@tcp0

2 Lustre: MDs temp-MDT0000: temp-OST0001_UUID now active, resetting orphans
5. 在客户端上挂载Lustre 文件系统。在客户端节点上运行：

```bash
1 root@client1 /］ mount -t lustre 10.2.0.1@tcp0:/temp /Iustre
```
该命令的输出为：
1 Lustre: Client temp-client has started
6. 确认文件系统已成功启动并正常工作，在客户端上运行 df，dd，ls命令。
a. 运行1fs df -h命令：
1 ［root@client1 /］ lfs df -h
1fs df -h命令列出了每个 OST 和MDT 的空间使用情况，如下所示：
1 UUID
bytes
2 temp-MDT0000_UUID 8.0G
3 temp-OST0000_UUID 800.0G
4 temp-OSTO001_UUID 800.0G
5 Eilesystem summary: 1.6T
Used
Available
Used

### 400.0M


### 7.6G


### 400.0M


### 799.6G


### 400.0M


### 799.6G

800.OM

### 1.6T

Mounted on
/lustre［MDT:0］
/lustre［osT:0］
/lustre［OST:1］
/lustre
b. 运行1fs df -ih命令：
1 ［root@client1 /］ lfs df -ih
lfs df -ih命令列出了每个 OST 和 MDT的节点使用情况，如下所示：
1 UUID
2 temp-MDT0000 UUID
3 temp-OST0000 UUID
4 temp-OST0001_UUID
Inodes

### 2.5M


### 5.5M


### 5.5M

5 filesystem summary: 2.5M
IUsed
IFree
IUsed

### 2.5M


### 5.5M


### 5.5M


### 2.5M

OoP
Mounted on
/lustre［MDT:0］
/lustre［OST:0］
/lustre［OST:1］
/lustre
c. 运行 dd命令：

1［root@client1 /］ cd /lustre
2 ［root@client1 /lustre］ dd if=/dev/zero of=/lustre/zero.dat bs=4M count=2
dd命令通过创建一个全为字符0的文件来验证写入功能。在此命令中，创建了一个
8MB 的文件。输出如下：
1 2+0 records in
2 2+0 records out
3 8388608 bytes （8.4 MB） copied, 0.159628 seconds, 52.6 MB/s
d. 运行 1s命令：
1 ［root@client1 /lustre］ 1s -lsah
13 -1sah命令列出了当前工作路徑下的所有文件及目录，如下所示：
1 total 8.0M
2 4.OK drwxr-Xr-× 2 root root 4.OK Oct 16 15:27 .
3 8.OK drwxr-xr-× 25 root root 4.OK Oct 16 15:27 ..
4 8.0M
1 root root 8.OM Oct 16 15:27 zero.dat
当Lustre 文件系统配置完成，则可投入使用。

### 10.2. 其他附加配置选项

这一部分我们将介绍如何扩展Lustre 文件系统并利用 Lustre 配置实用程序更改配
置。

### 10.2.1.扩展Lustre 文件系统

Lustre 文件系统可以通过添加 OST 或客户端来进行扩展。如须创建附加OST，请参
照上述步骤3和步骤5的说明。如须安装更多客户端，请为每个客户端重复执行步骤6。

### 10.2.2. 更改条带化默认配置

文件布局条带类型的默认配置如下表所示：

