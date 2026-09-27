# 08 性能调优、基准测试与 NRS 调度 (第 32~34 章)

> 来源：官方 Lustre 中文操作手册 (Lustre Chinese Operations Manual)

快照命令将在需要时内部调用配置日志功能。因此，使用快照时，屏障不是必需的，
而是作为一个选项包含在这里。以下配置日志命令独立于快照，可单独使用。
分配配置日志，请在 MGS上运行以下1ct1命令：

```bash
1 lctl fork_lcfg
```
用例：fork_lcfg
擦除配置日志，请在 MGS上运行以下1ct1命令：

```bash
1 lctl erase_lcfg
```
用例：erase_lcfg

## 第三十二章 Lustre 网络性能测试 （LNet Self-Test）


### 32.1.LNet 自检概述

它旨在：
LNet self-test（自检）是在LNet 和 Lustre 网络驱动程序 （LND）上运行的内核模块。

- 测试 Lustre 网络的连接能力

- 运行 Lustre 网络的回归测试

- 测试 Lustre 网络的性能
获得Lustre 网络的性能结果后，可调整LNet 的参数以获得最佳性能。
注意
除了性能影响之外，LNet 自检对Lustre 文件系统不可见。
LNet 自检集群包括以下两种类型的节点：

- 控制台节点-用于控制和监视 LNet自检集群的节点。控制台节点可以看作 LNet
自检的用户界面，可以是测试集群中的任何节点。所有自检命令都从控制台节点
输入。通过控制台节点，用户可以控制和监视整个 LNet 自检集群（会话）的状态。
控制台节点是独占的，用户不能通过一个控制台节点控制两个不同的会话。

- 测试节点-运行测试的节点。测试节点由用户通过控制台节点进行控制，用户不
需要直接登录它们。
LNet 自检有两个用户实用程序：

- Ist- 自检控制台的用户界面（在控制台节点上运行）。它提供了用于控制整个测试
系统的命令列表，如创建会话、创建测试组等等。

- Istclient- 用户空间 LNet 自检程序（运行在测试节点上）。1stclient实用程序与
用户空间 LND 和 LNet 链接。如果仅使用了内核空间 LNet 和 LND，则不需要此
实用程序。

注意
测试节点可以位于内核或用户空间中。控制台节点可以通过运行1st add_group
NID邀请内核测试节点加入会话，但控制台节点不能主动向会话中添加用户空间测试节
点。当测试节点运行1stclient连接控制台节点时，控制台节点可以被动地接受加入
会话的测试节点。

### 32.1.1. 前提条件

要运行 LNet 自检，以下模块必需同时在控制台节点和测试节点上加载：

- libcfs

- net

- lnet_selftest

- klnds：您网络配置所需的 Lustre 内核网络驱动 （LND）（如 ksocklnd、
ko2iblnd...）.
加载所需模块，运行：
1 modprobe Inet_selftest
该命令将递归地加载 LNet 自检所依赖的模块。
注意
尽管控制台节点和测试节点需要加载所有必备模块，用户空间测试节点不需要这些
模块。

### 32.2. LNet 自检操作

本节主要介绍如何创建和运行 LNet 自检。以下示例模拟了在InfiniBand 网络上的
客户端访问 TCP 网络上的一组 Lustre 服务器的流量模式（通过LNet路由器连接）。在
这个例子中，一半的客户端正在读，一半的客户端正在写。

### 32.2.1.创建会话

会话是在测试节点上运行的一组进程。为确保会话独占该测试节点，一个节点
上一次只能运行一个会话。使用控制台节点创建、更改或销毁会话（new_session，
end_session, show_session）。有关会话参数的更多信息，请参见本章第3.1 节"会
话命令"。
几乎所有的操作都应该在会话环境中执行。用户只能在自己的会话中通过控制台节
点操作节点。如果会话结束，所有测试节点的会话环境中止。
在控制台节点上设置LST
SESSION环境变量以标识会话，并创建一个名
为read_write的会话：

1 exort LST_SESSIONSS
2 lst new_ session read_write

### 32.2.2.设置组

组是被命名的节点集合。一个 LNet 自检会话中可以有任意数量的组。由于测试节
点可以包含在任意数量的组中，组成员不受限制。
组中的每个节点都有一个等级，由节点被添加到组中的顺序决定。该排名用于建立
流量测试模式。
用户只能控制自己会话中的节点。用户需要将节点添加到（会话的）组中来把节点
分配给会话。组中的所有节点都可以通过组名来引用。一个节点可以分配给多个会话
组。
在以下示例中，我们在控制台节点上建立了三个组：
1 lst add_group servers 192.168.10.［8, 10,12-16］etcp
2 Ist add_group readers 192.168.1.［1-253/21co2ib
3 Ist add_group writers 192.168.1.［2-254/2］co2ib
这三个组包括：

- LNet 自检会话期间作为”服务器”被"客户端”访问的节点

- 作为"客户端"节点，模拟从"服务器"读取数据。

- 作为”客户端"节点，模拟将数据写入"服务器”。
注意
通过运行1st add_group NID，控制台节点可以将内核空间测试节点与会话相
关联，但不能主动添加用户空间测试节点到会话中。当测试节点运行1stclient连接
控制台节点时，控制台节点可以被动地接受加入会话的测试节点。

### 32.2.3.定义及运行测试

测试将在两组节点之间生成网络负载。其中，源组用--from参数标识，目标组
用--to参数标识。当测试运行时，--from group模拟客户端，--togroup模拟一
组服务器，客户端向服务器节点发送请求并接收返回的响应。此活动旨在模拟 Lustre 文
件系统 RPC流量。
批处理测试（batch）是同时开始、同时停止，且并行运行的一组测试。测试必须始
终作为batch 的一部分运行（即使它只包含单个测试）。用户只能运行或停止这一组测
试，而不是单个测试。
批处理测试对文件系统没有破坏性，可以在普通的 Lustre 文件系统环境中运行（假
设其性能影响是可接受的）。

假设一个简单的批处理测试只包含了一个测试，即确定网络带宽是否导致了1/0瓶
颈。在本例中，--to group由 Lustre OSS组成，--from group由计算节点组成。可
以在此批处理测试中添加第二个测试来执行登录节点到MDS的 ping，以查看检查点是
如何影响1s -1进程的。
有两种类型的测试可用：

- ping-ping 生成一个简短的请求消息，以触发一个同样简短的响应。Ping 有助于
确定延迟和小消息开销并模拟 Lustre 元数据流量。

- brw -在brw（批量读写）测试中，数据从目标传输到源（brwread）或数据从
源传输到目标（brwwrite）。批量传输的大小使用 size 参数设置。brw测试有助
于确定网络带宽和模拟 Lustre /O 流量。
下面的例子创建了一个名为bu1k_rw的批处理。，然后添加了两个brw测试。第一
个测试模拟读操作，IM 数据从服务器发送到客户端，进行简单数据验证检查。第二个
测试模拟写操作，4K 数据从客户端发送到服务器，进行完整的数据验证检查。
1 lst add
Lbatch bulk_rw
2 lst add
_test --batch bulk
_rw --from readers --to servers\
brw read check=simple size=1M
4 lst add
test --batch bulk_rw --from writers --to servers\
5 brw write check=ful1 size=4K
流量模式和测试强度由测试类型、测试节点分布、测试并发性和 RDMA 操作类型
等属性决定。有关更多详细信息，请参见本章第3.3节"批处理和测试命令"。

### 32.2.4. 脚本样例

此LNet 自检脚本样例模拟了在 InfiniBand 网络上的客户端访问 TCP 网络上的一组
服务器的流量模式（通过LNet 路由器连接）。在这个例子中，一半的客户端正在读，一
半的客户端正在写。
在控制台节点上运行此脚本：
1 #！/bin/bash
2 EXPOrt LST SESSIONSS
3 Ist new_session read/write
4 lst add group servers 192.168.10.［8, 10, 12-16］etcp
5 lst add group readers 192.168.1.［1-253/21@o2ib
6 Ist add_ group writers 192.168.1.［2-254/21Co2ib
7 Ist add batch bulk_rw
8 lst add_test --batch bulk_rw --from readers --to servers \

9 brw read check=simple size-IM
10 1st add_ test --batch bulk_rw --from writers --to servers\
11 brw write check=ful1 size-4K
12 # start running
13 1st run bulk_rw
14 # display server stats for 30 seconds
I5 lst stat servers & sleep 30; kill $！
16#tear down
17 Ist end_session
注意
该脚本可简单地利用 shell 变量或命令行参数传递组 NID 参数（适用于通用目的）。

### 32.3. LNet 自检命令索引

LNet self-test （1st） 实用程序用于发出 LNet 自检命令。1st需要一些命令行参数。
第一个参数为命令名称，后面的参数由命令指定。

### 32.3.1.会话命令

这一小节介绍 1st 会话命令。
LST_FEATURES
Ist使用LST_FEATURES环境变量来确定启用哪些可选功能。所有功能都默认为禁
用。LST_FEATURES支持的值有：

- 1-次LNet 自检启用可变的页面大小。
示例：
I export LST FEATURES-1
LST_SESSION
1st 使用LST_SESSION 环境变量在本地自检控制台节点上标识会话。该变量应为
标识节点上每个会话进程的唯一数字值。在shell 脚本内将其设置 shell 进程ID 非常
方便，这样也有益于交互式使用。几乎所有的1st命令都需要设置L.ST_SESSION。
示例：
I exPort LST_SESSIONSS
new_session ［--timeout SECONDS］ ［--forcel SESSNAME
创建一个名为 SESSNAME的新会话。

参数
--timeout seconds
--force
说明
会话的控制台超时值。如果在此期间它一直保持空闲状态
（即没有命令发出），会话将自动结束。
结束冲突的会话。这决定了一个会话与另一个会话产生冲
突时谁"胜出”。当此节点上已有活动会话时，除非指定了
--force 标志，否则尝试创建新会话将失败。如果指定了
--force 标志，则活动会话结束。同样地，如果会话尝试
添加已被另一个会话”占有”的节点，则-force 标志将
允许此会话”窃取"该节点。
列出会话或报告会话冲突时打印的可读字符串。
name
示例：
I $ lst new_session --force read_write
end_session
停止当前会话中的所有操作和测试，并清除会话的状态。
1 $lst end_session
show_session
显示会话信息。该命令输出有关当前会话的信息。它不需要在过程环境中定义
LST_SESSION。
I $ Ist show_session

### 32.3.2.组命令

这一小节介绍1st 组命令。
add_group name NIDS ［NIDs.•.］
创建组并向该组添加测试节点的列表。
参数 说明
name 组的名称
NIDS
一个字符串，可以扩展为包含一个或多个 LNet NID。

示例：
1 $ Ist add_group servers 192.168.10.［35, 40-451etcp
2 $ 1st add_group clients 192.168.1.［10-100letcp 192.168.［2,4］.\
［10-20］etcp
update.
_group name ［--refreshl ［--clean status］ ［--remove
NIDs］
更新组中节点的状态或调整组成员。可用于从组中排除某些已崩溃的节点。
参数
说明
--refresh
刷新组中所有不活动节点的状态。
--clean status
从组中删除具有指定状态的节点。状态可能是：
active 一该节点正处于当前会话；
busy 一该节点被其他会话占有；
down-该节点被标记为下线状态；
unknown 一该节点状态尚不明；
invalid -除活动状态外的任一状态。
--remove NIDs
从组中移除指定节点。
示例：
1 $ lst update_group clients --refresh
2 $ Ist update_group clients --clean busy
3 $ lst update_group clients --clean invalid // \
invalid == busy || down |1 unknown
5 $ lst update group
clients
--remove \192.168.1.［10-20］@tcp
list_group ［name］
［--active］
［--busy］［--down］
［--unknown］
［--al1］
打印组的有关信息；如果未指定组，则列出当前会话中的所有组。
参数
说明
name
组名称
--active
--busy
列出状态为 active 的节点
列出状态为busy 的节点

参数
--down
--unknown
--al1
说明
列出状态为 down 的节点
列出状态为 unknown 的节点
列出所有节点
示例：
I 台 lst list_group
2 1） clients
3 2） servers
4 Total 2 groups
5S lst 1ist_group clients
6 ACTIVE BUSY DOWN UNKNOWN TOTAL
8 S Ist 1ist_group clients --all
9 192.168.1.10etcp Active
10 192.168.1.11@tcp Active
11 192.168.1.12@tcp Busy
12 192.168.1.130tcp Active
13 192.168.1.14@tcp DOWN
14 192.168.1.15atcp DOWN
15 Total 6 nodes
16 $ lst list_group clients --busy
17 192.168.1.12@tcp Busy
18 Total 1 node
del_group name
从会话中删除一个组。如果该组被任何测试引用，则操作失败。如果组中的节点仅
由该组引用，则将其从当前会话中踢出；否则，他们将仍在当前会话中。
1 $ lst del_group clients
Istclient --sesid NID --group name ［--server_mode］
使用1stclient来运行 userland 自检客户端。应先在控制台上创建会话，然后再执
行1stclient命令。1stclient只有两个强制选项：

参数
--sesid NID
--group name
--server_mode
说明
第一个控制台的 NID。
要加入的测试组。
可选选项。包含此选项将强制 LNet 以服务器的方式工作，如启动
接受器（如果底层NID 需要）或使用特权端口。只允许root 用户
使用 -server_mode 选项。
示例：
1 Console $ 1st new_session testsession
2 Client1 $ lstclient --sesid 192.168.1.52etcp --group clients
示例：
1 Client1 $ lstclient --sesid 192.168.1.52etcp |--group clients --server_mode

### 32.3.3. 批处理测试命令

这一小节介绍 1st 批量测试命令。
add_batch name
会话启动时会创建一个名为batch的默认批处理测试集。您可以使用add_batch指
定批处理测试名称：
1 $ lst add batch bulkperf
创建一个名为 bulkperf的批处理测试。
1 add_test --batch batchname ［--1oop 100p_count］［--concurrency active_count］
［--distribute source_count:sink_count］\
--from group --to group brwlping test_options
在批处理中添加一个测试，其参数如下所示：
参数
说明
--batch batchname
--100p
100p_count
--concurrency
active_count
--distribute
source_count：
命名一组测试以便随后执行。
运行测试的次数。
一次激活的请求数。
为指定测试确定客户端节点与服务器节点

参数
sink_count
--from group
--to group
Ping
brw
说明
的比率。这将允许您指定各种拓扑，如一
对一、多对多；将源组和目标组划分成子
集，只有来自源组子集的节点与来自目标
组子集的节点匹配时才能进行通信。
源组（测试客户端）。
目标组（测试服务器）。
发送一个简短的请求信息，收获一个简短的
应答消息。更多内容请参见2.3节
“定义和运行测试"。ping没有任何附加选项。
收获一个简短的应答消息。更多内容请参见

### 2.3 节"定义和运行测试”。选项有：

read | write一读或写，默认为读。
size=bytes ［KM］-以字节，千字节或兆
字节为单位的1/0大小（即 size=1024，
size-4K，size=IM）；默认值是4千字节。
check=ful1|simple—数据校验检查（数据
校验和）。默认不进行此项数据校验检查。
有关参数 distribute 使用的示例
1 Clients： （C1, C2,C3,C4,C5,C6）
2 Server： （S1, S2,S3）
3 --distribute 1:1 （C1->S1）、（C2->S2）、（C3->S3）、（C4->S1），（C5->S2）、
4 \ （C6->$3）/* -> means test conversation */ --distribute 2:1 （C1,C2->S1），
（C3,C4->S2），（C5,C6->S3）
5 --distribute 3:1 （C1,C2,C3->S1），（C4,C5,C6->S2），（NULI->S3）
6 --distribute 3:2 （C1,C2,C3->S1,S2），（C4,C5,C6->S3,S1）
7 --distribute 4:1 （C1,C2,C3, C4->S1），（C5,C6->S2），（NULI->S3）
8 --distribute 4:2 （C1,C2,C3,C4->S1,S2），（C5,C6->S3,S1）
9 --distribute 6:3 （C1,C2,C3,C4,C5,C6->S1,S2,S3）

--distribute 1:1为默认设置，即一个源节点与一个目标节点进行通信。
使用--distribute 1:n（n为目标组的大小）时，一个源节点与目标组的所
有节点进行通信。
注意，如果源节点比目标节点多，则某些源节点可能共享相同的目标节点。如果目
标节点数多于源节点数，则排名较高的目标节点将处于空闲状态。
有关brw 测试的示例
1 S 1st add_group clients 192.168.1.［10-17］etcp
2S
Ist add_group servers 192.168.10.［100-1031@tcp
3 S lst add
Lbatch bulkperf
4 $ Ist add_test --batch bulkperf --loop 100 --concurrency 4\
5 --distribute 4:2 --from clients brw WRITE size=16K
在上面的例子中，一个名为 bulkperf的批量测试将执行16k 字节的批量写入请求。
在此测试中，两组的四个客户端（源）分别写入四台服务器（目标），如下所示：

- 192.168.1.［10-13］将写入 192.168.10.［100,101］

- 192.168.1.［14-171将写入 192.168.10.［102,103］
1ist_batch ［name］ I--test index］ ［--activel ［--invalid］
［--serverlclient］
列出当前会话中的批量测试或列出批量测试中的客户端和服务器节点。
参数
说明
--test index
列出批处理中的测试。如果未使用任何选项，则会列出该批次
中的所有测试。如果使用下列选项之一，则只列出指定的测试：
active 一只列出活动的测试；
invalid 一只列出无效的测试；
server/client 一列出此批量测试的服务器和客户端节点。
示例：
1 $ lst list batchbulkperf
2 $ lst 1ist_batch bulkperf
3 Batch: bulkperf Tests: 1 State: Idle
4 ACTIVE BUSY DOWN UNKNOWN TOTAL
5 client 8 0008

6 server 40004
7 Test 1 （brw） （1oop: 100, concurrency:4）
8 ACTIVE BUSY DOWN UNKNOWN TOTAL
9 client 80008
10 server 40004
11 $ lst 1ist_batch bulkperf --server --active
12 192.168.10.100etcp Active
13 192.168.10.101@tcp Active
14 192.168.10.102etcp Active
15 192.168.10.103etcp Active
run name
运行此批量测试：
1 $ lst run bulkperf
stop name
停止此批量测试：
I $ lst stop bulkperf
query name ［--test index］ ［--timeout seconds］ ［--1oop
1oopcount］［--delay seconds］［--a11］
查询批量测试状态：
参数
说明
--test index
--timeout seconds
--100p#
--delay seconds
--a11
只查询指定测试。测试的起始索引为1。
等待RPC的超时时间。默认值是5秒。
查询的循环次数。
每次查询的时间间隔。默认值是5秒。
批处理或测试中所有节点的状态列表。
示例：
1 $ lst run bulkperf
2 $ lst query bulkperf --1oop
5 --delay 3
3 Batch is running
4 Batch is running

5 Batch is running
6 Batch is running
7 Batch is running
8 $ lst query bulkperf --al1
9 192.168.1.10ctcp Running
10 192.168.1.11@tcp Running
11 192.168.1.12atcp Running
12 192.168.1.13@tcp Running
13 192.168.1.140tcp Running
14 192.168.1.150tcp Running
15 192.168.1.16tcp Running
16 192.168.1.17etcp Running
17 $ lst stop bulkperf
18 $ Ist guery bulkperf
19 Batch is idle

### 32.3.4. 其他命令

这一小节介绍 lst 命令。
ping ［-session］ ［--group name］［--nodes NIDs］［--batch
name］［--server］ ［--timeout seconds］
向节点发送hello'查询。
参数
说明
--session
向当前会话的所有节点发送 Ping。
--group name
--nodes NIDs
--batch name
向指定组的节点发送 Ping。
向指定节点发送 Ping。
向批处理的所有客户端发送 Ping。
--server
将RPC发送到所有服务器节点而不是客户端节点。该选项
仅和--batch name 一起使用。
--timeout seconds RPC 超时时间。
示例：
1 # lst ping 192.168.10.［15-201@tcp

2 192.168.1.15etcp Active ［session: 1iang id: 192.168.1.30tcp］
3 192.168.1.16etap Active ［session: 1iang id: 192.168.1.30tcp］
4 192.168.1.17etcp Active ［session: 1iang id: 192.168.1.30tcp］
5 192.168.1.18etcp Busy ［session: Isaac id: 192.168.10.10@tcp］
6 192.168.1.19etop Down ［session: SNULI> id: INET_NID_ANY］
7 192.168.1.20etcp Down
［session: ANUL.I> id: INET_NID_ANY］
stat ［--bw］ ［--rate］ ［--read］ ［--write］ ［--max］ ［--min］
［--avg］ " "［--timeout
seconds］
［--delay seconds］ groupINIDs
［group|NIDs］
一个或多个节点的总体性能和 RPC统计信息。
参数
说明
--bw
--rate
--read
--write
--max
--min
--avg
--timeout seconds
--delay seconds
显示指定组/节点的带宽
显示指定组/节点的 RPC 率
显示指定组/节点的读操作统计信息
显示指定组/节点的写操作统计信息
显示统计信息中的最大值
显示统计信息中的最小值
显示统计信息中的平均值
统计数字中的 RPC超时时间。默认为5秒。
统计数字中的时间间隔（以秒为单位）。
示例：
1 $ lst run bulkperf
2 S lst stat clients
3 ［LNet Rates of clients］
4［W］ Avg: 1108 RPC/s Min: 1060 RPC/s Max: 1155 RPC/s
5 ［R］ Avg: 2215 RPC/s Min: 2121 RPC/s Max: 2310 RPC/s
6 ［LNet Bandwidth of clients］
7 ［W］ Avg: 16.60 MB/s Min: 16.10 MB/s Max: 17.1 MB/s
8 ［R］ Avg: 40.49 MB/s Min: 40.30 MB/s Max: 40.68 MB/s
指定组名称（group）将为该测试组中的所有节点收集统计信息。例如：

1 $ lst stat servers
servers是由 1st add_group创建的组的名称。
指定NID 范围（NIDs）将为选定节点收集统计信息。例如：
I s lst stat 192.168.0.［1-100/2］@tcp
只有LNet 性能统计信息可用。默认情况下，所有统计信息都会显示。用户可以使
用这些选项指定附加信息。
show_error ［--sessionl ［group INIDs］••
列出测试节点上故障 RPC数量：
参数
说明
--session
列出当前测试会话中的错误。此选项不会列出历史 RPC错误。
示例：
1 $ lst show_error client
2 sclients
3 12345-192.168.1.15@tcp：［Session: 1 brw errors, 0 ping errors］\
［RPC: 20 errors, 0 dropped，
5 12345-192.168.1.16@tcp：［Session: 0 brw errors, 0 ping errors］\
［RPC: 1 errors, 0 dropped, Total 2 error nodes in clients
7 $ lst show_error --session clients
8 clients
9 12345-192.168.1.15@tcp： ［Session: 1 brw errors, 0 ping errors］
10 Total 1 error nodes in clients

## 第三十三章对 Lustre 文件系统进行基准测试（Lustrel/O 工具箱）


### 33.1.1

使用 Lustre I/O 工具箱
Lustre IO 工具箱中的工具用于对Lustre 文件系统硬件进行基准测试，并在安装
Lustre 软件之前确认硬件是否正常工作。它也可以用来验证集群中各种硬件和软件层的
性能，查找和排除1/0问题。
通常，性能测试从单个原始设备开始，然后再到设备组。一旦建立了原始性能，其
他软件层就会逐渐增加并进行测试。


### 33.1.1. Lustre I/O 工具箱内容

I/O 工具箱包含三个测试，其中每个测试都会测试 Lustre 软件堆栈中的一个更高层
次的软件层：

- sgpdd-survey- 只测量设备的基础”裸机”性能，绕过内核块设备层，缓冲区缓
存和文件系统。

- obdfilter-survey- 直接在 OSS 节点上或通过网络在 Lustre 客户端上测量一
个或多个 OST 的性能。

- ost-survey- 单独对OST 执行 I/O 操作来进行性能比较，以检测 OST 是否由于
硬件问题性能受损。
通常在这些测试中，Lustre 文件系统应该提供85-90%的原始设备性能。
stats-co1lect 实用程序负责收集来自 Lustre 客户端和服务器的应用程序分析信
息。更多内容见第6 节"收集应用程序分析信息（stats-collect）"。

### 33.1.2. Lustre I/O 工具箱使用准备

必须满足以下条件才能使用 Lustre I/O 套件中的测试：

- 可在系统中对节点进行远程免密访问（ssh或rsh）。

- LNet 自检已完成，Lustre 网络已正常安装及配置。

- Lustre 文件系统软件已安装。

- sg3
_uti1s软件包提供了 sgP_dd 工具（sg3_uti1s为独立的 RPM软件包，可
通过 YUM 在网上获取）。
从 https://downloads.whamcloud.com/下载 Lustrel/O 工具箱 （lustre-iokit）。

### 33.2. 测试原始硬件I/O 性能（sgpdd-survey）

sgpdd-survey工具用于测试原始硬件的裸机1/O 性能，同时绕过尽可能多的内
核。本调查通过模拟OST 服务多个条带文件来表征SCSI 设备的性能。此调查收集的数
据可以帮助您了解此设备的 Lustre OST 的性能预期。
该脚本使用sgP_dd执行原始磁盘 1/O。它使用数量可变的sgP_dd线程运行，以显
示性能如何随着请求队列深度的变化而变化。
该脚本生成数量可变的sgP_dd实例，每个实例读取或写入磁盘的不同区域，从而
演示多个并发的条带文件的性能差异。
下面介绍了有关磁盘性能测量的一些技巧和见解。其中一些信息针对的是 RAID 阵
列或 Linux RAID 的实施。


- 性能受限于最慢的磁盘。在创建 RAID 阵列之前，分别对所有磁盘进行基准测试。
我们经常会遇到阵列中所有设备的驱动器性能不一致的情况，请更换比其他磁盘
慢得多的磁盘。

- 磁盘和阵列对请求大小非常敏感。要确定给定磁盘的最佳请求大小，请使用不同
请求大小（从4KB、IMB 到2 MB）对磁盘进行基准测试。
注意
sgpdd-survey 脚本会覆盖正在测试的设备，从而导致该设备上所有数据丢失。
因此，选择要测试的设备时请务必小心。
加载所有 LUN 的阵列性能并不总是与单个 LUN 单独测试时的性能相匹配。
必要条件：

- s93_utils 软件包的sgp_dd 工具。

- Lustre 软件不少必需的。
被测试的设备必须满足以下两个要求之一：

- 如果设备是SCSI 设备，则它必须出现在sg_map的输出中（确保内核模块sg已加
载）。

- 如果设备是原始设备，则它必须出现在raw -qa的输出中。
原始设备和 SCSI 设备在测试规范中不能混合使用。
注意
如果您需要创建原始设备以使用sgpdd-survey工具，请注意：由于某些版本的"
原始"实用程序（包括 Red Hat Enterprise Linux 4U4 提供的版本）的某些版本中的错误，
原始设备0无法使用。

### 33.2.1. 调试 Linux 存储设备

传输大量1/O 数据（1MB）到磁盘，可能需要如是调整以下几个内核参数：
1 /sys/block/sdN/gueue/mnax_sectors_kb = 4096
2 /sys/block/sdN/queue/max_phys_segments = 256
3 /proc/scsi/sg/allow_dio = 1
4 /sYs/mnodule/ib_srp/parameters/srp_sg_tablesize = 255
5 /sys/block/sdN/queue/scheduler
注意
推荐使用的调度程序为 deadline 和 noop。默认为 deadline，也可将其设置为 noop。


### 33.2.2. 运行sgpdd-survey

sgpdd-survey脚本必须要根据测试的特定设备以及脚本保存其工作和结果文件
的位置（通过指定$｛rslt｝变量）来进行自定义。自定义变量在脚本开始处描述。
当sgpdd-survey脚本运行时，它会创建大量工作文件和两个结果文件。所有创建
的文件的名称都以变量$｛rslt｝中定义的内容为前缀。（默认值是/tmp。）这些文件包
括：

- 包含标准输出数据的文件（如 stdout）
rslt_date_time.sunmary

- 临时（tmp）文件
rslt_date_time_*

- 收集tmp 文件进行再次进行详细验证
rslt_date_time.detail
stdout 和 .summary 文件将含以下类似内容：
1 total
_size 8388608K rSz 1024 thr 1 crg 1 180.45 MB/s 1 × 180.50 \
= 180.50 MB/s
每一行对应于一个测试的运行。每个运行的测试将具有不同数量的线程、记录大小
或区域数量。

- total
_size-被测试文件的大小（以KB 为单位，以上示例中为8GB）。

- r3Z - 记录大小（以KB 为单位，以上示例为1 MB）。

- thr-生成1/O 的线程数量（以上示例为1个线程）。

- crg-当前区域，1/O发送到的磁盘上的不相交的区域的数量（以上示例为1个区
域，表示不需要进行搜索）。

- MB/s - 总带宽，即总数据大小除以所需时间（以上示例为 180.45 MB/s）。

- MB/s-剩下的数字显示：区域数量X最慢磁盘的性能，作为对总带宽的完整性检
查。
如果线程太多，sgP_dd脚本不太可能分配 1/O缓冲区，则会输出 ENOME 而不是
总带宽结果。
如果一个或多个sgP_dd实例未成功报告带宽，则会输出 FAILED 而不是总带宽结
果。


### 33.3.OST 性能测试（obdfilter-survey）

obdfilter-survey脚本通过不同数量的线程和对象（文件）生成顺序1/0，以模
拟Lustre 客户端的I/O模式。
obdfilter-survey脚本可以无需任何干预网络直接在OSS节点上运行，来测量
OST 存储性能；也可以在Lustre 客户端上远程运行，来测量包括网络开销在内的OST
性能。
obdfilter-survey用于描绘以下性能情况：

- 本地文件系统一在这种模式下，obdfilter-survey脚本直接执行一个或多
个obdfilter实例。该脚本可以在一个或多个 OSS 节点上运行（如所有OSS都
连接到相同的多端口磁盘子系统时）。
使用case = disk参数，运行脚本对所有的本地OST运行测试。该脚本会自动检
测所有本地OST 并将其包括在调查结果中。
要仅针对特定的 OST运行测试，请使用 targets=parameter运行脚本，明确
列出要测试的OST。如果某些 OST 位于远程节点上，除了指定 OST 名称（例如，
oss2:luster-OST0004）外，还需指定它们的主机名。
所有obdfilter实例都是直接驱动的。该脚本自动加载obdecho模块（如果需要
的话）并为每个obdfilter实例创建一个echo_client实例，以便直接生成对OST的
1/O请求。
更多详细信息，请参见本章第3.1 节"本地磁盘性能测试"。

- 网络一在此模式下，Lustre 客户端通过网络生成1/O 请求，但这些请求不会发送到
OST 文件系统。OsS 节点运行obdecho服务器来接收请求，但在将它们发送到磁
盘之前丢弃它们。
将参数 case=network和targets=hostname | IP_of_server 传递给脚本。对
于每个网络测试案例，脚本都会执行所需的设置。
更多详细信息，请参见本章第3.2节"网络性能测试”。

- 网络上的远程文件系统-在这种模式下，obdfilter-survey脚本在Lustre 客户
端生成至远程 OSS 的1/O，将数据写入文件系统。
对所有本地OSC运行测试，请将参数case = netdisk传递给脚本。您也可以将
指定了一个或多个要运行测试的 OSC设备的参数target= parameter传递给脚本
（如luster-OST0000-osc-ffff88007754bc00）。
更多详细信息，请参见本章第3.3节"测试远程磁盘性能"。
注意

obdfilter-survey具有潜在的破坏性，存在小概率丢失数据的风险。为
降低这种风险，不应在数据需要保存无损的设备上运行obdfilter-survey。
因此，运行obdfilter-survey的最佳时间是在Lustre 文件系统投入生产之前。
obdfilter-survey在生产文件系统上运行可能是安全的，因为它使用对象序列2
来创建对象，而一般文件系统通常使用对象序列0创建对象。
如果obdfilter-survey测试在完成之前被终止，则会造成少量空间的流失。您
可以忽略它或重新格式化文件系统。
obdfilter-survey脚本不能扩展到数十个 OST，它仅用于测量各个存储子系统
的I/O性能，而不是整个系统的可扩展性。
必须根据测试组件和脚本工作文件的保存位置对obdfilter-survey脚本进行自
定义。请在obdfilter-survey脚本开头描述自定义变量，并特别注意脚本中列出的
每个参数的最大值。

### 33.3.1.本地磁盘性能测试

obdfilter-survey脚本可以自动或手动在本地磁盘上运行。此脚本通过将不同
线程数、对象数和I/O大小的工作负载发送 OST 到来分析存储硬件（包括管理存储的文
件系统和 RAID 层）的整体吞吐量。
运行obdfilter-survey脚本将输出有关存储硬件性能的信息及其硬件饱和点。
运行plot-obdfilter脚本可实现数据可视化，它根据obdfilter-survey的输
出生成一个 CSV 文件和用于导入到电子表格或 gnuplot 中的参数。
运行obdfilter-survey脚本，请创建标准 Lustre 文件系统配置，不需要特殊的
设置。
执行自动运行：
1. 启动 Lustre OSTs.
Lustre OST 应挂载在要测试的OSS 节点上。Lustre 客户端目前不需要进行挂载。
2．确认obdecho模块已加载。运行：
modprobe obdecho
3. 运行 obdfilter-survey 脚本，并使用参数 case=disk。
例如，运行一个两个对象（nobjhi），两个线程（thrhi）和 1024 MB 传输大小的本地测
试：

```bash
$ nobjhi=2 thrhi=2 size=1024 case=disk sh obdfilter-survey
```
4.写入、覆盖写、读取等的性能测试如下：


```bash
# example output
```
Fri Sep 25 11:14:03 EDT 2015 Obdfilter-survey for case-di sk from
hdslfnb6123
ost 10 sz 167772160K rsz 1024K obj
10 thr 10 write 10982.73 ［

### 601.97,2912.91］ rewrite 15696.54 ［1160.92, 3450.85］ read 12358.60 ［


### 938.96,2634.87］

文件./lustre-iokit/obdfilter-survey/README.obdfilter-survey
提供了有关输出内容的解释说明：
1 ost10
is the total number of OsTs under test.
2 sZ 167772160K
is the total amount of data read or written （in bytes）.
3 rsZ 1024K
is the record size （size of each echo_client I/0, in bytes）•
4 obj
is the total number of objects over all osTs
5 thr
is the total number of threads over all OSTs and objects
6 write
is the test name. If more tests have been specified they
all appear on the same 1ine.
8 10982.73
is the aggregate bandwidth over al1 OsTs measured by
dividing the total number of MB by the elapsed time.
10 ［601.97,2912.91］ are the minimum and maximum instantaneous bandwidths seen
on
any individual OST.
12 Note that although the numbers of threads and objects are specifed per-OST
13 in the custonization section of the script, results are reported aggregated
14 over al1 osTs.
执行手动运行：
1.启动Lustre OSTs。
Lustre OST 应挂载在要测试的OSS 节点上。Lustre 客户端目前不需要进行挂载。
2． 确认obdecho模块已加载。运行：
modprobe obdecho
3. 确定OST 名。
在待测试的OSS 节点上，运行lct1d1 命令。命令输出的第四行列出了OST设
备名，如：


```bash
1 $ lctl dl |grep obdfilter
```
2 0 UP obdfilter lustre-OST0001 Lustre-OST0001_UUID 1159
3 2 UP obdfilter lustre-OST0002 1ustre-OST0002_UUID 1159
4 ….
4. 列出所有您希望测试的 OSTs。
使用targets=parameter列出所有OSTS，由空格间隔。按名称列出单个 OST，
请使用 fsname-OSTnumber（如lustre-OST0001）的格式，不需要指定MDS 或
LOV。
5. 运行 obdfilter-survey 脚本，并使用参数 targets=parameter。
例如，运行一个两个对象（nobjhi），两个线程（thrhi）和 1024 MB 传输大小的本地测
试：
1 $ nobjhi=2 thrhi=2 size=1024 targets-"1ustre-OST0001\
lustre-OST0002" sh obdfilter-survey

### 33.3.2. 网络性能测试

obdfilter-survey 脚本只能在网络上自动运行，不能手动运行测试。
要运行网络测试，需要特定的Lustre 文件系统设置，并确保满足配置要求。
执行自动运行：
1.启动 Lustre OSTs。
Lustre OST 应挂载在要测试的 OSS 节点上。Lustre 客户端目前不需要进行挂载。
2． 确认obdecho模块已加载。运行：
modprobe obdecho
3. 启动1ct1并检查设备列表是否空，运行：

```bash
lctl dl
```
4. 运行 obdfilter-survey 脚本，使用参数 case=network 和 targets=
hostnamel ip_of_server，如：

```bash
$ nobjhi=2 thrhi=2 size=1024 targets="oss0 oss1"\
```
case=network sh obdfilter-survey

5. 在服务器端，查看统计信息：

```bash
lctl get_param obdecho.echo_srv.stats
```
其中，echo_srV为由脚本创建的 obdecho服务器。

### 33.3.3.远程磁盘性能测试

obdfilter-survey 脚本可以自动或手动在网络磁盘上运行。运行网络磁盘测试，
启动 Lustre 标准配置名，无需特殊设置。
执行自动运行：
1.启动Lustre OSTs。
Lustre OST 应挂载在要测试的OSS 节点上。Lustre 客户端目前不需要进行挂载。
2. 确认obdecho模块已加载。运行：
modprobe obdecho
3. 运行 obdfilter-survey 脚本，使用参数 case=netdisk，如：
1 $ nobjhi=2 thrhi=2 size=1024 case-netdisk sh obdfilter-survey
执行手动运行：
1.启动 Lustre OSTs。
Lustre OST 应挂载在要测试的 OSS 节点上。Lustre 客户端目前不需要进行挂载。
2．确认obdecho模块已加载。运行：
modprobe obdecho
3. 确定OSC名。
在待测试的OSS 节点上，运行 lct1 d1 命令。命令输出的第四行列出了OSC设
备名，如：

```bash
1 $ lctl dl |grep obdfilter
```
2 3 UP osc lustre-OST0000-osc-ffff88007754bc00\
54b91eab-0ea9-1516-b571-5e6df349592e 5
4 4 UP osC lustre-OST0001-osc-ffff88007754bc00\
54b91eab-0ea9-1516-b571-5e6df349592e 5
6...

4.列出所有您希望测试的 OSCs。
使用targets=parameter列出所有OSCs，由空格间隔。按名称列出单
个 OSC，请使用fsname-OST_name-osc-instance（如lustre-OST0000-0sc-
ffff88007754bc00）的格式，不需要指定MDS或LOV。
5. 运行 obdfilter-survey脚本，使用参数 targets=osc 和 case=netdisk。
例如，运行一个两个对象（nobjhi），两个线程（thrhi）和1024 MB 传输大小的本地测
试：
s nobjhi=2 thrhi=2 size=1024 \
targets-"Iustre-OsT0000-osc-ffff88007754bc00\
lustre-OST0001-0sc-ffff88007754bc0o"sh obdfilter-survey

### 33.3.4. 输出文件

obdfilter-survey 脚本运行时，它会创建大量工作文件和两个结果文件。所有
文件都以变量 $｛rs1t｝定义的值作为前缀。
文件
说明

```bash
$｛rslt｝.summary
```
和stdout一样

```bash
$trSlt｝.script_*
```
每个主机一个测试脚本文件

```bash
$｛rslt｝.detai1_tmp* 每个OST 一个结果文件
```

```bash
$｛rslt｝.detail
```
集结果文件进行事后验证
obdfilter-survey脚本遍历执行指定测试的所有线程和对象，并检查所有测试
过程是否已成功完成。
注意
obdfilter-survey如果脚本异常终止或遇到不可恢复的错误，则可能无法正常
清除脚本。在这种情况下，可能需要手动清除，包括终止任何正在运行的1ct1实例（本
地或远程），删除脚本创建的echo_client实例以及卸载obdecho。

### 33.3.4.1. 脚本输出

.summary 文件及 obdfilter-survey 脚本的 stdout 包含类似
以下内容：
1 ost 8 sz 67108864K rsz 1024 obj 8 thr 8 write 613.54 ［ 64.00, 82.00］
其中：

参数及值
说明
ost 8
sz 67108864K
TSZ 1024
obj8
thr8
write

### 613.54

［64,82.00］
被测试的 OSTs总数
读/写数据总量（KB）
记录大小（每个 echo_client 1/O 的大小，单位为KB）
所有 OSTs上的对象总数
所有 OSTs上的线程总数
测试名。如果指定了更多的测试名，它们都将在同一行显示。
所有 OSTs上的总带宽（由数据总MB 数除以所花时间得到）
每个 OST 上的最低和最高的即时带宽
注意
虽然在脚本自定义时，线程和对象的数量是按每个OST指定的，但在报告结果时，
该数量汇总了所有 OSTs。

### 33.3.4.2. 可视化结果 为使结果可视化，我们可以将obdfilter-survey脚本汇总数

据（宽度固定）导入到 Excel（或任何图形包）中，并绘制图像比较带宽和线程数量（不
同数量的并发区域）的关系。这将显示执行不同数量的1/0 时的OSS 性能情况（给定数
量的并行访问对象或文件）。
另外，我们也可使用文件 lct1 get_param obdfilter.*.brw_stats 中
的disk io size' 直方图来监视和记录每次测试期间的平均磁盘1/O大小。这些数字有
助于在大型1/O 未提交到底层磁盘时识别系统中的问题（可能由设备驱动程序或 Linux
块层中的问题引起）。
I/O 工具包中的plot-obdfilter脚本是将输出文件处理为.csv 格式并使
用gnuplot绘制图形的示例。

### 33.4. OST 1/O 性能测试（ost-survey）

ost-survey 工具是一个 shell脚本，它使用1fs setstripe对单个 OST执行 I/
O。该脚本将文件（当前使用dd）写入Lustre 文件系统中的每个OST，并比较读写速度。
因此，ost-survey 可以用于检测完全相同磁盘子系统之间的异常情况。
注意
我们经常发现集群中LUN的性能差异很大。这可能是由磁盘故障、测试期间 RAID
重建，或网络硬件故障引起的。

要运行ost-survey脚本，请提供文件大小（以KB 为单位）和 Lustre 文件系统挂
载点。如：
1$./ost-survey.sh -s 10 /mnt/lustre
典型的输出为：
1 Number of Active OST devices : 4
2 Worst Read osT indx: 2 speed: 2835.272725
3 Best Read OsT indx: 3 speed: 2872.889668
4 Read Average: 2852.508999 +/- 16.444792 MB/s
5 Worst Write osT indx: 3 speed: 17.705545
6 Best
Write osr indx: 2 speed: 128.172576
7 Write Average: 95.437735 +/- 45.518117 MB/s
8 Ost# Read（MB/s） Write（MB/s） Read-time Write-time
9 --
11 1
12 2
13 3

### 2837.440


### 2864.433


### 2835.273


### 2872.890


### 126.918


### 108.954


### 128.173


### 17.706


### 0.035


### 0.035


### 0.035


### 0.035


### 0.788


### 0.918


### 0.780


### 5.648


### 33.5. MDS 性能测试 （mds-survey）

mds-survey 脚本用于测试本地元数据性能，使用echo_client来驱动MDS 堆
栈的 MDD 层。它可以用于以下的操作：

- Open-create/mkdir/create

- Lookup/getattr/setxattr

- Delete/destroy

- Unlink/rmdir
这些操作将由可变数量的并发线程运行，对用户指定的目录进行测试。可以所有
线程都执行单个目录（dir_count=1），也可以执行各自的私有目录（dir_count-x thrlo=x
thrhi=x）。
mdd 实例是直接驱动的。该脚本会根据需要自动加载 obdecho 模块、创建 echo_client
实例。
该脚本还可以通过设置大于零的 stripe_count 来创建 OST 对象。
执行运行：
1. 启动 Lustre MDT.

Lustre MDT 必须在待测试的 MDS 节点上挂载。
2. 启动 Lustre OSTs（可选，只在使用OST 对象测试时需要此步骤）
Lustre OSTs 必须在OSS 节点上挂载。
3. 运行 mds-survey脚本。
脚本必须根据测试组件和工作文件保存位置进行自定义。自定义变量如下：

- thrlo-启动测试的线程，如果比 dir_count少则此变量可省略。

- thrhi-测试的最多线程数。

- targets -MIDT 实例。

- file_count-每个线程测试的文件数。

- dir_count -测试的总目录数。必须小于或等于 thrhi。

- stripe_count-OST 对象上的条带数。

- tests_str - 测试操作。至少必须包含"create" 和"destroy"。

- start_number - 为防止名称冲突的线程基数。

- layer-待测试的 MDS 堆栈层
在没有创建OST 对象的情况下运行：
在OST 未挂载的情况下设置 Lustre MDS。随后引用 mds-survey脚本。
s thrhi=64 file_count=200000
sh mds-survey
创建 OST 对象并运行：
在至少挂载了一个 OST 的情况下设置Lustre MDS。随后引用 mds-survey 脚本，
使用 stripe_count 参数。
s thrhi=64 file_count=200000 stripe_count=2 sh mds-survey
注意：可以使用目标变量指定特定的 MDT 实例。

```bash
$ targets=lustre-MDT0000 thrhi=64 file_count=200000
```
stripe_count=2 sh mds-survey

### 33.5.1. 输出文件

mds-survey 脚本运行时，它会创建大量工作文件和两个结果文件。所有文件都以
变量 $｛rslt｝定义的值作为前缀。
文件
说明

```bash
$｛rSlt｝.summary
```

```bash
$｛rSlt｝.script_*
```
和stdout一样
每个主机一个测试脚本文件

文件
说明

```bash
$｛rslt）.detai1_tmp* 每个OST一个结果文件
```

```bash
$｛rslt｝.detail
```
收集结果文件进行事后验证
mds-survey脚本遍历执行指定测试的所有线程和对象，并检查所有测试过程是
否已成功完成。
注意
mds-survey 如果脚本异常终止或遇到不可恢复的错误，则可能无法正常清除脚
本。在这种情况下，可能需要手动清除，包括终止任何正在运行的1ct1实例（本地或远
程），删除脚本创建的echo_client实例以及卸载obdecho。

### 33.5.2. 脚本输出

.summary 文件及mds-survey 脚本的stdout 包含类似以下内容：
1 mdt 1 file 100000 dir 4 thr 4 create 5652.05 ［ 999.01, 46940.481 destroy

### 5797.79 ［ 0.00, 52951.551

其中：
参数及值
mdt 1
file 100000
dir 4
thr 4
create, destroy

### 565.05

［64, 82［999.01,46940.48］
说明
被测试的 MDT 总数
每个线程操作的文件总数
目录总数
所有目录上的线程总数
测试名。如果指定了更多的测试名，它们都将在同一行显示。
所有 MDT上的总带宽（由操作总数除以所花时间得到）
每个MDT 上可见的最低和最高的即时操作
注意
如果脚本输出含有"ERROR"，这通常意味着在运行期间存在问题，如 MDT 或OST
上的空间不足。更多有关调试的详细信息可在$｛rs1t｝.detai1文件中找到。


### 33.6. 收集应用程序分析信息（stats-collect）

stats-co1lect 实用程序包含以下用于从 Lustre 客户端和服务器收集应用程序分
析信息的脚本：

- 1stat.sh-在每个配置文件节点上运行的单个节点的脚本。

- gather_stats_everywhere.sh -收集统计信息的脚本。

- config.sh - 包含自定义配置描述的脚本。
stats-collect实用程序需要：

- 在你的集群上安装和设置Lustre 软件。

- 对这些节点的 SSH和SCP 免密访问。

### 33.6.1. stats-collect

stats-co1lect 通过在config.sh脚本中包含性能分析配置变量来进行配置。
每个配置变量都采用以下格式，其中0表示仅在脚本启动和停止时才收集统计信息，而
n表示要收集统计信息的时间间隔（以秒为单位）：
I statistiC_INTERVAL=OIn
所收集的统计信息包括：

- VMSTAT- 内存和CPU 使用率以及总读取/写入操作

- SERVICE- Lustre OST 和 MDT RPC 服务统计信息

- BRW- OST 批量读写统计信息 （brw_stats）

- SDIO - SCSI 磁盘IO统计信息 （sd_iostats）

- MBALLOC -1diskfs 块分配统计信息

- IO - Lustre 目标操作统计信息

- JBD-ldiskfs 日志信息

- CLIENT-Lustre OSC 请求信息
所收集的分析信息包括：
开始收集 config.sh 脚本中指定的每个节点的统计信息。
1. 通过输入以下命令启动每个节点上的收集配置文件守护进程：
sh gather_stats_everywhere.sh config.sh start
2. 运行测试。

3. 停止在每个节点上收集统计信息，清理临时文件并创建一个分析压缩包。
sh gather
_stats_everYwhere.sh config.sh stop 1og_name.tgz
指定了 10g_name.tgz时，将创建分析概要压缩包/tmp/1og_name.tgz.
4. 分析收集的统计信息并为指定的分析概要数据创建一个 csv 压缩包。
sh gather
_stats
_everywhere.sh config.sh analyse
10g_tarball.tgz csv

## 第三十四章 Lustre 文件系统调试


### 34.1.优化服务线程数量

一个OSS最少可以有2个服务线程，最多可以有512个服务线程。服务线程数与每
个 oss 节点上有多少RAM 和多少个 CPU 有关，可通过（1个线程/128MB * num_cpus）
来计算。如果OSS节点上的负载很高，则会启动新的服务线程以并发处理更多请求，最
多为线程的初始数量的4倍（最大次512）。对于2GB 2-CPU 系统，默认线程数为32，
最大线程数力 128。
在以下情况中，增加线程池的大小可能会有所帮助：

- 多个 OST 从单个OSS 中导出

- 后端存储正在同步运行

- 由于缓慢的存储，1/0 完成时间过长
在下列情况中，减小线程池的大小可能会有所帮助：

- 客户存储容量过载

- 有很多"缓慢"的1/O或类似的消息
增加 I/O线程数允许内核和存储将多个写入聚合在一起以获得更高效的磁盘1/O。
OSS线程池是共享的，每个线程为内部1/O缓冲区分配大约1.5 MB（即：最大RPC大
小+0.5 MB）的空间。
增加线程池大小时，必须考虑内存消耗情况。大量的搜索工作和专门等待1/0的
OST 线程导致驱动器在性能下降之前只能维持一定数量的1/O 并行操作。在这种情况
下，一种明智的做法是通过减少OST线程的数量来减少负载。
确定 OSS线程的最佳数量需要反复的试验。其值随不同的配置而变化，受到每个
OSS上的 OST数量，磁盘数和磁盘速度，RAID 配置以及可用的RAM等因素的影响。
一开始，您可以将该线程数设置为节点上实际磁盘轴的数量。如果使用 RAID，则需要
减去未用于实际数据的死磁盘轴数（例如，RAIDS的N个轴中的1个，RAID6的N个

轴中的2个），并监视常规工作负载期间客户端的性能。如果性能下降，请增加线程数
并查看其工作情况，直到性能再次下降或达到令人满意的成都。
注意
如果线程太多，单个1/O 请求的延迟可能会变得非常高，应该避免这种情况。请使
用上述方法来永久地设置所需的最大线程数。

### 34.1.1.指定 OSS服务线程数

在 OSS 节点上模块加载时可通过 osS_num_threads 参数指定 OST 服务线程的数
量：
1 options ost oss_num_threads-｛N｝
启动后，OSS的最大和最小线程数可通过
｛service｝.thread_｛min,max,started｝ 调节，在运行时更改值：
1 lct1 ｛get, set｝_param ｛service）.thread_｛min,max, started）
这和在 MDS 绑定线程的工作方式类似。

- osS_cpts=［EXPRESSION］一绑定默认 OSS 服务至由［EXPRESSION］定义的
CPTs。

- oss_10_cpts=［EXPRESSION］一绑定默认 OSS I/O服务至由［EXPRESSION］定
义的CPTs。

### 34.1.2. 指定 MIDS 服务线程数

在MDS 节点上模块加载时可通过 mds_num_threads 参数指定MDS 服务线程的
数量：
1 options mds mds_num_threads-｛N）
启动后，MDS 的最大和最小线程数可通过
｛service｝.thread_｛min,max,started） 调节，在运行时更改值：
1 lct1 ｛get,set｝_param ｛service） .thread_｛min,max, started）
启动的MDS 服务线程数取决于系统大小和服务器上的负载，默认最大值为64。线
程的最大潜在数（MDS_MAX_THREADS）为1024。
注意
挂载时，每个 CPT每个服务启动两个 OSS和 MIDS线程，根据服务器负载来动态增
加运行的服务线程数量。设置*_num_threads参数将立即为该服务启动指定数量的
线程，同时禁用线程自动创建。（在Lustre 2.3中引入）
Lustre 2.3中引入了新的参数，为管理员提供了更多的控制。


- mds_rdpg_num_threads一控制提供读取页服务的线程数。读取页服务用于处
理文件关闭和 readdir 操作。

### 34.2.绑定 MIDS服务线程到CPU分区

在 Lustre 2.3版中引入的 Node Affinity（节点关联性），可以将MDS线程绑定到特
定的 CPU分区（CPT），以提高CPU 高速缓存使用率和内存局部性。将自动选择CPT数
和 CPU 核心绑定的默认值，以便为给定数量的CPU 提供良好的整体性能。管理员也可
更改这些设置。有关指定CPU 内核到 CPT的映射的详细信息，请参见本章第4节"libcfs
调试"。

- mds_num_cpts=［EXPRESSION］绑定默认MDS 服务线程至
由［EXPRESSION］定义的 CPTS。如，mds_num_cpts=［0-3］ 将绑定 MDS
服务线程至CPT［0,1,2,3］。

- mds_rdpg_num_cpts=［EXPRESSION］ 绑定读取页服务线程至
由【EXPRESSION］定义的CPTs。读取页服务负责处理文件关闭操作及
readdir 请求。如，mds_rdpg_num_cpts=［4］将绑定读取页服务线程至 CPTA。
设置参数必须在文件/etc/modprobe.d/lustre.conf中载入模块前。如：
options lnet networks=tcp0（eth0） options mdt mds_num_cpts=［0］

### 34.3. LNet 参数调试

本节主要介绍LNet 可调参数。在某些系统上可能需要使用这些参数来提高性能。

### 34.3.1. 发送和接收缓冲区大小

内核在网络上分配发送和接收信息的缓冲区。
使用ksock1nd 分开设置用于发送和接收信息的缓冲区的参数。
1 options ksocklnd tx buffer_size=0 rx buffer_size-0
如果这些参数保留默认值（0），系统会自动调整发送和接收缓冲区大小。几乎在所
有情况下，此默认设置会产生最佳性能。如果您不是网络专家，请不要尝试调整这些参
数。

### 34.3.2.硬件中断（enable_irq_affinity）

网络适配器生成的硬件中断可能由系统中的任一CPU 进行处理。在某些情况下，
我们希望将网络流量保持在单个 CPU 本地，以便保持处理器缓存温度并减少环境切换

的影响。这特别有利于具有多个网络接口尤其是接口数量等于 CPU 数量时的SMP 系
统。启用enable_irq_affinity参数，请输入：
1 options ksocklnd enable_irq_affinity-1
在其它情况下，如果您运行在一个含单个快速接口（如10Gb/s）和两个以上的CPU
的 SMP平台，则禁用该参数可能会提升性能：
1 options ksocklnd enable_irq_affinity=0
此参数默认为关闭。请通过测试更改此参数时的性能情况来进行调试。（在Lustre

### 2.3中引入）


### 34.3.3. 绑定针对 CPU 分区的网络接口

Lustre 2.3及以上版本提供了高级网络接口控制。管理员可以将接口绑定到一个
或多个 CPU分区，通过 LNet 模块的选项进行指定。例如，o21b0（ib0）［0,1］ 确保
了o21b0的所有消息由在CPTO和CPT1上执行的LND 线程处理；tcp1（ethO）［01确保
了tcp1的消息由CPTO上的线程处理。

### 34.3.4. 网络接口信用

网络接口（NI）信用在所有CPU 分区（CPT）之间共享。例如，如果一台机器有
四个 CPT 且NI信用值为512，则每个分区有128个信用值。如果系统中存在大量 CPT，
则LNet 将检查并验证每个 CPT的NI信用值，以确保每个CPT 都有可用的信用值。如
果一台机器有16个 CPT 且 NI信用值为256，则每个分区只有16个信用值，将可能会
对性能产生负面影响。因此，LNet 会自动将信用值调整为8*peer_credits（默认情
况下，peer_credits 为8），因此每个分区都有64个信用值。
增加 credits/peer_credits 数使得LNet能够将更多的飞行消息发送到特定的
网络或对等节点并保持传输饱和，从而提高高延迟网络的性能（以消耗更多内存为代
价）。
管理员可以使用ksoclnd或ko2ib1nd修改 NI信用值。在下面的例子中，TCP连
接的信用值被设置为256。
1 ksocklnd credits-256
设置IB 连接的信用值为256：
1 ko2iblnd credits-256
注意
会持续。
在 Lustre 2.3及以上版本中，LNet 可能会重新验证 NI 积分，则管理员请求可能不


### 34.3.5.路由器缓存区

当一个节点被设置为 LNet 路由器时，会分配三个缓存区：极小、小和大的缓存区。
这些缓存区按CPU 分区分配，用于缓存到达路由器待转发到下一跳的消息。三种不同
大小的缓存区适应不同大小的消息。
如果消息可以放入极小缓冲区，那么使用极小的缓冲区；如果它不能放入极小的缓
冲区但是可以放入小缓冲区，则使用小缓冲区；如果消息不适用于极小或小缓冲区，则
使用大缓冲区。
路由器缓冲区由所有CPU 分区共享。对于具有大量CPT的机器，可能需要手动指
定路由器缓冲区号以获得最佳性能。路由器缓冲区数量过少可能会导致存放资源的CPU
分区匮乏。

- tiny_router_buffers：用于信号和确认消息的零负荷缓冲区。

- smal1_router_buffers：用于简短消息的4KB负荷缓冲区。

- large_router _buffers；最大负荷为1 MB 的缓冲区（对应于1MB 的推荐
RPC大小）
通常，默认路由器缓冲区设置下系统性能良好。因此，LNet 将自动将
其设置为默认值以减少资源匮乏的可能性。路由器缓冲区的大小可以使
用Large_router_buffers参数修改进行更改。如，修改大缓冲区的大小：
1 Inet large_router_buffers-8192
注意
在Lustre 2.3及以上版本中，LNet 可能会重新验证路由器缓存区设置，则管理员请
求可能不会持续。

### 34.3.6.门户循环

门户循环定义了 LNet 应用的向上层传递事件和消息的策略。上层有 PLRPC服务或
LNet 自检。
如果禁用了门户循环，则LNet 将根据源 NID 的散列向CPT传递消息。因此，来自
特定对等方的所有消息都将由相同的CPT处理。这可以减少CPU之间的数据流量。但
是，对于某些工作负载，这种行为可能会导致整个 CPU 的负载失衡。
如果启用了门户循环，则LNet将对所有CPT 中的传入事件进行循环。这可以在整
个 CPU上更好地平衡负载，但同时也可能导致CPU 间的交互开销。
管理员可通过 echo value>/proc/sYs/Inet/portal_rotor更改当前策略。
其中，value有以下四种选项：

- OFE

在所有传入请求上禁用门户循环。

- ON
在所有传入请求上启用门户循环。

- RR_RI
为路由消息启用门户循环。

- HASH_RT
默认值。路由消息将通过源 NID 的散列（而不是路由器的 NID）传递到上层。

### 34.3.7. LNet 对等节点健康状况

以下两个选项可用于帮助确认对等节点的健康状况：

- peer_timeout一活性查询发送给对等体节点的超时时间（以秒为单位）。例如，
如果peer_timeout设置为180秒，则每隔180秒会向对等节点发送一次活性查
询。此功能只在节点配置为 LNet 路由器时生效。
在路由环境中，Peer_timeout功能应该始终处于打开状态。如果路由器检查程序
已启用，则应在客户端和服务器上将该值设置为0以关闭该功能。
对于非路由环境来说，启用peer_timeout选项可提供有关健康状况的信息，如对
等节点是否存活。客户端可以在发送消息时确认MGS或OST 是否已启动。如果收到回
复，则表明对方在线，否则将出现超时。
通常，peer_timeout应设置不小于 LND 超时设置的值。
使用o2ib1nd（IB）驱动程序时，peer_timeout应至少为ko2iblnd选项值的两
倍。

- avoid
L_asym_router_failure一默认设置是1。此时，客户端或服务器上运行
的路由器检查程序会周期性地 ping 所有节点上routes 参数设置中标识的NID 所对
应的路由器，以确定每个路由器接口的状态。
如果路由器的任一NID 关闭，则我们认为该路由器处于关闭状态。例如，路由
器X有三个 NID:Xnidl、xnid2和Xnid3。客户端通过xnid1连接到路由器。客户
端启用了路由器检查程序。路由器检查器通过xnid1定期向路由器发送一个 ping。路
由器以每个 NID 的状态来回应 ping。例如，在这个例子中，响应消息为Xnidl=up，
Xnid2=up,xnid3=down。如果avoid_asym_router_failure==1且任一NID 关

闭，则路由器处于关闭状态。我们认为该路由器X已关闭，不会再使用其路由消息。如
果avoid_asyn_router_failure==0，则将继续使用路由器×的路由消息。
在任何客户端或服务器上，以下路由器检查器参数必须设置为此选项对应的最大
值：

- dead_router_check.
_interval

- 1ive_router_check.
interval

- router
_ping_timeout
例如，dead
_router_check_interval 参数在任何路由器上都应被设置为
MAX。（在 Lustre 2.3中引入）

### 34.4. libcfs 调试

上）。
Lustre 2.3通过CPU分区（CPT）引入了绑定服务线程，允许了系统管理员针对
Lustre 服务线程在哪些CPU 内核上运行进行调试（在OSS服务、MDS 服务以及客户端
CPT 有助于在OSS 或MDS 节点上为系统功能（如系统监视，HA heartbeat 或类似
任务）预留一些核。在客户端上，可以把 Lustre RPC服务线程限制在一小部分核中，从
而避免干扰计算操作。这些核是直接连接到网络接口上的。
默认情况下，Lustre 软件将根据系统中 CPU 的数量自动生成CPU 分区
（CPT）。可以在 libcfs 模块上通过cpu_npartitions=NUMBER 设置明确的CPT数。
cpu_npartitions的值必须是1到当前在线CPU 数之间的整数。
在 Lustre 2.9和更高版本中，默认情况下每个 NUMA 节点使用一个 CPT。在Lustre
早期版本中，如果在线CPU核数量为四个或更少，则默认情况下使用单个 CPT，可根
据CPU 核数量创建额外的 CPT，通常每个 CPT 有4-8个核。
cpu_npartitions=1将禁用大部分 SMP 节点的Affinity 功能。

### 34.4.1.CPU分区（字符串模式）

可以使用字符串模式表示法来描述 CPU 分区。例如，cpu_pattern=N表示系统中
每个 NUMA 节点有一个 CPT，每个 CPT 映射该 NUMA 节点的所有CPU核。
也可明确指定 CPU核与 CPT 之间的映射，例如：
1 cpu_pattern="0［2,4,6］ 1［3,5, 7］
创建两个CPT。其中，CPTO包含核2、4、6，CPTI 包含核3、5、7。CPU核0和1
不会用于 Lustre 服务线程，但可以用于节点服务（如系统监视、HA heartbeat 线程等）。
可使用numact1（8）或其他应用程序指定方法在用户空间中完成非 Lustre 服务与这些
CPU 核的绑定（这部分内容超出了本文的范围）。

1 cpu_pattern="N 0［0-3］ 1［4-7］
创建两个 CPT。其中，CPTO包含NUMA 节点［0-3］上的所有CPU,CPT1 包含
NUMA 节点［4-7］上的所有CPU。
CPU 分区的当前配置可以通过lctI get_parm cpu_partition_table读取。
例如，只有单个 CPT包含全部四核 CPU 的简单四核系统：

```bash
I s lctl get_param cpu_partition_table cpu_partition_table-0 : 0 1 2 3
```
以下为更大的 NUMA 系统，有4个 CPT、每个 CPT 有12个CPU核：
1 $ lct1 get_param cpu_partition_table
2 cpu_partition
_table-
3 0
：012345678910 11
4 1
：12 13 14 15 16 17 18 19 20 21 22 23
5 2
：24 25 26 27 28 29 30 31 32 33 34 35
6 3
：36 37 38 39 40 41 42 43 44 454647

### 34.5. LND 调试

LND 调试允许指定每个 CPU 分区的线程数量。管理员可以使用nscheds参数
为ko2iblnd和ksock1nd设置线程，从而调整每个分区的线程数量而不是LND上的线
程总数。
注意
ko2iblnd和ksocklnd的默认线程数是自动设置的，该默认值在许多典型场景中
保证了良好的运行，对内核数量多或少的系统均适用。

### 34.5.1.ko2iblnd 调试

下表对用于调试的ko2ib1nd模块参数进行了概述：
模块参数
默认值
说明
service
cksum
timeout
nscheds
conns_per_peer
（在RDMA_PS_TCP 内的）服务号
设置为非零启用消息（非 RDMA）校验和。
超时时间（以秒为单位）。
每个调度程序池中的线程数（每个
CPT）。0表示该值为核的数量。
4 （omniPath），每个对等节点的连接数。消息通过

模块参数
nt×
credits
peer_credits
peer_credits_hiw
peer_buffer_credits
peer_timeout
ipif_name
retry_count
rnr_retry_count
keepalive
ib_mtu
concurrent_sends
map_on_demand
默认值
说明
1（Everything 连接池循环发送。OmniPath 提供
else）
了显著的改进。（Lustre 2.10中
引入）
启动时为每个池分配的消息描述符
的数量。在运行时会增长。由所有
CPT共享。
网络上的并发发送数量。
并发发送至1个对等点的数量。
与IB 队列大小相关（受限于IB 队列
大小）。
急于返回信用值时。
每个对等路由器的缓冲信用值。
失去活性消息到宣布对等节点死亡
之间的秒数（小于或等于0表示
禁用）。
ib0
IPoIB 端口名称。
未收到 ACK 时重新传输。
RNR重传。
发送keepalive 前的空闲秒数。
IB MTU 256/512/1024/2048/4096.
发送工作队列的大小。0则表示该
队列大小和map_on_demand
或peer_credits相同。
0（pre-4.8
Linux） 1 （4.8
Linux
为连接预留的片段数量。如果
为零，则使用全局内存（可能存
在安全问题）。如果非零，则使

模块参数
默认值
onward） 32
（OmniPath）
Emr_pool_size
fmr_flush_trigger
Emr_cache
dev_failover
require_privileged_port 0
use_Privileged_port
wr9_sge
说明
用FMR或FastReg 进行内存注册。
该值需要在两个对等节点之间达
成一致。
每个 CPT 上的 fimr 池大小
（>=ntx/4）。
在运行时会增长。
触发池刷新的dirty FMR 号。
设置力非零来实现FMIR缓存。
用于绑定的HCA 故障切換
（0表示 OFF，1表示 ON，其他值保留）
接受连接时的require 特权端口。
初始化连接的 use 特权端口
每个请求 scatter/gather 元素组
的数量。用于处理可能会消耗
请求工作数量两倍的碎片。
（Lustre 2.10中引入）

### 34.6.网络请求调度程序（NRS）调试

网络请求调度程序（NRS）允许管理员通过应用不同策略影响服务器处理 RPC的
顺序（基于每个 PTLRPC服务）。这样做的目的是为了更好的性能，一些未来的策略还
可能提供离散的性能特征。
PTLRPC 服务的 NRS 策略状态可通过｛service｝•nrs_policies来读取和设
置。读取PTLRPC服务的 NRS策略状态，请运行：
1 lct1 get_param ｛service｝.nrs_policies
例如，读取ost_io服务的 NRS策略状态：

```bash
1 $ lctl get_param ost.OSS.ost_io.nrs_policies
```
2 ost.OSS.ost_io.nrs_policies-

4 regular_reguests：
- name: fifo
state: started
fallback:yes
queved:0
active:0
- name: Crrn
state: stopped
fallback: no
queued:0
active:0
- name: Orr
state:stopped
fallback: no
queued:0
active:0
- name: trr
state:started
fallback:no
queued: 2420
active: 268
- name: tbf
state: stopped
fallback: no
queued:0
active:0
- name: delay
state: stopped
fallback:no
queued:0
active:0

41 high_priority_requests：
- name: fifo
state: started
Eallback:yes
gueued:0
active:0
- name: crrn
state: stopped
fallback: no
queued:0
active:0
- name: Orr
state: stopped
fallback: no
queued:0
active:0
- name: trr
state: stopped
fallback:no
queued:0
active:0
- name:tbf
state: stopped
fallback: no
queued:0
active: 0
- name: delay
state: stopped
fallback: no
queued: 0

active: 0
NRS策略状态显示在一个或两个部分中，取决于所查询的PTLRPC 服
务。第一部分为regular_requests，可用于所有 PTLRPC 服务。第二部分
为high_priority_requests，为可选部分。这是因为一些 PTLRPC 服务能够将
某些类型的RPC视为较高优先级的 RPC，使它们能优先被服务器处理。对于不支持高
优先级 RPC 的 PTLRPC 服务只能看到regular_requests部分。
每个PTLRPC 服务上的每个 NRS策略都有一个单独的实例，用于处理常规或高优
先级的 RPC（如果该服务支持高优先级的RPC）。对于每个策略实例，将显示以下字段：
字段
说明
name
策略名
state
策略状态。力 invalid、stopping、stopped、 starting、started.
策略完全启动为 started状态。
fallback 是否为回退策略。回退策略用于处理其他已后用策略无法处理的RPC 或不
支持的RPC。值为no或yes当前只有FIFO 策略可以作为回退策略。
queued
active
策略拥有的等待服务的 RPC 数量。
策略正在处理的 RPC 数量
在PTLRPC服务上启用 NRS策略，运行：
1 lct1 set_param ｛service｝.nrs_policies=
2 policy_name
这将为给定服务上的常规和高优先级 RPC（如果该 PLRPC 服务支持高优先级 RPC）
启用策略名为 policy_name 的策略。例如，为Idlm_cbd 服务启用 CRR-N NRS 策略，请
运行：
1 $ lct1 set_param ldlm.services.1dlm_cd.nrs_policies-crrn
2 1dlm.services.1dlm_cbd.nrs_policies-crrn
对于支持高优先级 RPC的PTLRPC 服务，您还可以通过运行以下命令并提供可选
选项 reglhptoken，以便启用 NRS策略仅用来处理给定 PTLRPC服务上的常规或高优先
级RPC：
1 lct1 set param ｛service｝.nrs policies="
2 policy name
3 reg|hp"

例如，要启用TRR策略用来处理ost_1o服务上的常规 RPC（非高优先级 RPC），
请运行：
1 $ lct1 set_param ost.OSS.ost_io.nrs_policies-"trr reg"
2 ost.OSS.ost_io.nrs_policies "trr reg"
注意
启用 NRS策略时，策略名称必须使用小写字母，否则将造成操作失败并显示错误
消息。

### 34.6.1. 先进先出 （FIFO）策略

先进先出 （FIFO）策略按照从INet 层到达的相同顺序处理服务中的 RPC，不进行任
何特殊处理来更改 RPC处理流。FIFO 是所有PTLRPC 服务上所有类型RPC 的默认策
略，且无论其他策略状态如何都始终处于启用状态。把FIFO 策略作为备份策略，以防
已更复杂的策略处理 RPC失败或不支持给定类型的 RPC。
FIFO 策略没有用于调整其行为的可调参数。

### 34.6.2. 基于 NID 的客户端循环（CRR-N）策略

通过基于 NID 的客户端轮询（CRR-N）策略对所有类型 RPC执行批量循环调度，
每个批次由源自相同客户端节点的RPC（由其NID标识）组成。CRR-N 旨在提高集群
间的资源利用率，并通过在所有客户端之间更均匀地分配可用带宽来缩短某些情况下的
作业完成时间。
可以在所有类型的PTLRPC服务上后用CRR-N策略。以下是可用于调整其行为的
可调参数：

- ｛service｝.nrs_crrn_quantum
｛service｝.nrs_crrn_quantum 用于确定 RPC的最大批处理大小；度量单位是
RPC 的数量。读取CRR-N 策略允许的最大批处理大小，请运行：
Ict1 get_param ｛servicel.nrs_crrn_quantum
例如，在ost_io服务上读取 CRR-N策略允许的最大批处理大小，运行：

```bash
s lctl get_param ost.OSS.ost_io.nrs_crrn_quantum
```
ost.OSS.ost_io.nrs_crrn_quantum-reg_quantum: 16
hp_quantum:8
如上所示，您可以看到常规（reg_quantum）和高优先级（hp_quantum） RPCs 有
两个独立的最大批处理大小。
为指定服务设置CRR-N策略允许的最大批处理大小，运行：


```bash
lctl set_param ｛service｝.nrs_crrn_quantur-
```
1-65535
这将为常规和高优先级 RPC（如果PLRPC服务支持高优先级 RPC）设置给定服务
上允许的最大批处理大小。
例如，将1d1m_canceld服务上允许的最大批处理大小设置为16，请运行：

```bash
$ lctl set_param ldlm.services. Idlm_canceld.nrs_crrn_quantum-16
```
1dlm.services.ldlm_canceld.nrs_crrn_quantum-16
对于支持高优先级 RPC 的PTLRPC 服务，您也可以为常规和高优先级 RPC指定不
同的最大批处理大小：

```bash
$ lctl set_param ｛service｝.nrs_crrn_guantur=
```
reg_quantumlhp_quantum：
1-65535"
例如，在1d1m_cance1a服务上将最大高优先级 RPC 批处理大小设置为32：

```bash
$ lct1 set_param
```
1d1m.services.1dIm_canceld.nrs_crrn_quantun= "hp_quantum: 32"
1dlm.services.1dlm_canceld.nrs_crrn_quantum-hp_quantum: 32
通过使用最后一种方法，您还可以在单个命令中将常规和高优先级 RPC 批处理最
大大小设置力不同的值。

### 34.6.3. 基于对象的循环（ORR）策略

基于对象的循环（ORR）策略对批量读写（brw）RPC的批量循环调度，每个批次
由属于相同后端文件系统对象的RPC（由OST FID 标识）组成。
ORR 策略仅适用于 ost_io 服务。RPC 批处理可能包含批量读取和批量写入 RPC。
根据每个 RPC 的文件偏移量或物理磁盘偏移量（仅适用于批量读取 RPC），每个批处理
中的RPC按升序方式排序。
ORR 策略旨在通过顺序读取批量 RPC（也可能包括批量写入 RPC）来增加某些情
况下的批读取吞吐量，从而最大限度地减少昂贵的磁盘查找操作。任何资源利用率的改
善或更好地利用RPC 间的相对位置都可能有助于提升性能。
ORR 策略有以下可用于调整其行为的可调参数：

- ost.OSS.ost_io.nrs_orr_quantum
ost.osS.ost_io.nrs_OrI_quantum 用于确定 RPC的最大批处理大小；度量
单位是 RPC的数量。读取 ORR策略允许的最大批处理大小，请运行：


```bash
$ Lctl get_param ost.OSS.ost_10.nrs_orr_quantum
```
ost.OSS.ost」
_io.nrs_orr_quantum-reg_quantum:256
hp_quantum: 16
如上所示，您可以看到常规（reg_quantum）和高优先级（hp_quantum） RPCs 有
两个独立的最大批处理大小。
设置 ORR策略允许的最大批处理大小，运行：

```bash
$ lctl set_param ost.OSS.ost_1o.nrs_orr_quantun-
```
1-65535
这将为常规和高优先级 RPC所允许的最大批处理大小设置指定的大小。
还可以为常规和高优先级 RPC指定不同的最大允许批处理大小，请运行：

```bash
f lctl set_param ost.OSS.ost_io.nrs_orr_quantun=
```
reg_quantumlhp_quantum：
1-65535
例如，将常规 RPC 的最大批处理大小设置为128，请运行

```bash
$ lct1 set_param ost.OSS.ost_10.nrs_orr_quantum-reg_quantum: 128
```
ost.OSS.ost
_io.nrs_orr_guantun-reg_quantun: 128
通过使用最后一种方法，您还可以在单个命令中将常规和高优先级 RPC批处理最
大大小设置不同的值。

- ost.OSS.ost
_10.nrs
'_orr_offset_type
ost.OSS.ost
_io.nrs_orr_offset_type 用于确定ORR策略是基于逻辑文件
偏移量还是物理磁盘偏移量对每批次 RPC 进行排序。读取 ORR策略的偏移类型，请运
行：

```bash
$ lctl get_param ost.OSS.ost_1o.nrs_orr_offset_type
```
ost.OSS.ost
_io.nrs_orr_offset_type-reg_offset_type:physical
hp _offset_type:logical
常规（reg_offset_type）和高优先级（hp_offset_type） RPC 有单独的偏移
类型。
设置ORR策略的偏移类型，运行：
s lct1 set_param ost.OSS.ost_io.nrs_orr_offset_type=
physical|logical
这将设置常规和高优先级 RPC 的偏移类型为指定值。
您还可以运行以下命令为常规和高优先级 RPC指定不同的偏移类型：

s Lcti set param ost.OSS.ost
_10.nrs_orr_offset_type-
reg_offset.
-typelbp_offset_type：
Physical|logical
例如，将高优先级 RPC的偏移类型设置为物理磁盘偏移量，运行：
s lct1 set_param
ost.OSS.ost_io.nrs_orr_offset_type hp_offset_type:physical
ost.OSS.ost
_10.nrs_orr_offset_type hp_offset_type:physical
通过使用最后一种方法，您还可以在单个命令中将常规和高优先级 RPC批处理最
大大小设置为不同的值。
注意
无论此可调参数的值什么，只有逻辑偏移量可以用于批量写入 RPC 的排序。

- ost.OSS.ost_io.nrs_orr_supported
ost.osS.ost_io.nrs_orr_supported 用于确定 ORR策略处理的RPC类型，
读取 ORR策略支持的 RPC类型，运行：

```bash
$ lctl get_param ost.OSS.ost_1o.nrs_orr_supported
```
ost.OSS.ost
_io.nrs_orr_supported-reg_supported:reads
hp_supported-reads_and_writes
如上所示，您可以看到常规（reg_quantum）和高优先级（hP_quantum） RPCs 有
不同的支持的 RPC类型。
为ORR策略设置支持的 RPC类型，运行：

```bash
s lctl set_param ost.OSS.ost，
```
_1o.nrs_orr_supported-
reads|writeslreads
and
wEites
这将设置 ORR 策略支持的常规和高优先级 RPC类型为指定值。
您还可以运行以下命令为常规和高优先级 RPC 指定不同的支持类型：
s lct1 set_param ost.OSS.ost_io.nrs_orr_supported-
reg_ supported|hp_supported：
reads |writes|reads_and_writes
例如，为常规请求将 RPC 支持类型设置为批量读和批量写：

```bash
$ lctl|
```
set param
ost.OSS.ost
_io.nrs_orr_supported-reg_supported:reads_and_writes
ost.OSS.ost
_io.nrs_orr_supported-reg_supported:reads_and writes
通过使用最后一种方法，您还可以在单个命令中将常规和高优先级 RPC的支持类
型设置为不同的值。


### 34.6.4. 基于目标的循环（TRR）策略

基于目标的循环（TRR）策略对brw RPC 执行批量循环调度，每个批次由属于相同
OST 的RPC（由OST 索引标识）构成。
除了使用brw RPC 的目标 OST 索引而不是后端fs对象的 OST FID 来确定RPC调
度顺序以外，TRR策略与基于对象的循环（ORR）策略相同。TRR 策略和 ORR策略的
实施效果相同，它使用以下可调参数来调整其行为：

- ost.oss.ost_10.nrs_trr_quantum
与 ORR策略中的 ost.OSS ost_io nrs_orr_guantun 参数的目标和用法完全
相同。

- ost.OSS.ost_io.nrs_trr_offset_type
与 ORR策略中的 ost.OSS.ost_1o.nrS_Orr_offset_type 参数的目标和用
法完全相同。

- ost.OsS.ost_io.nrs_trr_supported
与 ORR策略中的 ost.OsS.ost_io.nrs_orr_supported 参数的目标和用法
完全相同。
（在Lustre 2.6中引入）

### 34.6.5. 令牌桶过滤器（TBF）策略

令牌桶过滤器（TBF）策略通过强制限制客户端或作业的 RPC速率而使 Lustre 服务
达到一定的QoS（服务质量）。


![图 28: NRS 网络请求调度程序 CRR-N / TBF 流程](images/manual_p423_xref2168.png)

*图 28: NRS 网络请求调度程序 CRR-N / TBF 流程*

Enqueue
based on
ID
FIFO
queues
Token
buckets
Dequeue
based on
deadlines
（0〇0
Incoming
RPC
Tokens
Handling
RPC
图 28:Internal stucture of TBF policy
图34.1TBF策略的内部结构
当RPC 请求到达时，TBF 策略根据它的分类将它放到一个等待队列中。根据TBF
配置，RPC 请求的分类可以基于 RPC的 NID 或JobID。TBF 策略在系统中需要维护多
个队列，RPC 请求分类的每个类别有一个队列。这些请求在处理之前等待FIFO 队列中
的令牌，从而使RPC速率保持在限制之下。
Lustre 服务太忙无法及时处理所有请求时，所有队列的处理速率都不会达到指定值。
但除了一些 RPC 速率比配置慢以外，并无任何坏处。在这种情况下，速率较高的队列
比速率较低的队列具有优势。
管理队列的RPC速率，我们不需要手动设置每个队列的速率，而是通过定义TBF
策略匹配规则来确定 RPC速率限制。所有定义的规则存储在有序列表中。每个新创建
的队列将遍历规则列表并将第一个匹配的规则作为其规则，从而确定 RPC令牌速率。
规则可在运行时添加到列表或从列表中删除。每当规则列表发生更改时，队列将更新其
匹配的规则。

### 34.6.5.1. 启用 TBF 策略 命令：

1 lct1 set_param ost.OsS.ost_io.nrs_policies"tbf <policy"
目前，RPC可以根据其 NID、JOBID、OPCode 或UID/GID 来进行分类。启用TBF
策略时，您可以指定其中一种方式，或使用"tbf"允许所有方式并执行细粒度RPC请求
分类。

示例：

```bash
1 $ lctl set_param ost.OSS.ost_10.nrs_policies-"tbf"
```

```bash
2$ lctl set_param ost.OSS.ost_io.nrs_policies "tbf nid"
```
3 $lct1 set_param ost.OSS.ost_io.nrs_policies "tbf jobid"

```bash
4 $ lctl set_param ost.OSS.ost_io.nrs_policies "tbf opcode"
```

```bash
5 $lctl set_param ost.OsS.ost_io.nrs_policies "tbf uid"
```

```bash
6 $ lctl set_param ost.OSS.ost_1o.nrs_policies "tbf gid"
```

### 34.6.5.2. 启用TBF 规则 TBF规则在 ost.OsS.ost_i0.nrs_tbf_rule参数中定义。

命令：

```bash
1 lctl set_param x.x.x.nrs_tbf_rule-
```
2 "［reglhp］ start rule_name arguents..."
其中，'rule_name'是一个最多15 个字符的字符串，用于标识 TBF 策略规则的名称，
可以使用字母、数字字符和下划线（例如：*test_rule_AI"）。
'arguments' 是一个字符串，用于根据不同的类型指定详细的规则。
以下是 TBF 策略的不同类型：

- 基于 NID 的TBF策略
命令：

```bash
1 lctl set_param x.x.x.nrs_tbf_rule-
```
2 "［reglhp］ start rule_name nid=｛nidlist） rate-rate"
'nidlist 的格式与配置 LNET 路由相同。'rate' 为该规则的RPC速率（上限）。
示例：

```bash
1 $ lctl set_param ost.OSS.ost_10.nrs_tbf_ruler\
```
2 "start other_clients nid=｛192.168.*.*etcp｝ rate=50"
3 $ lct1 set_param ost.OSS.ost_io.nrs_tbf_rule=\
4 "start computes nid-｛192.168.1.［2-128］@tcp｝ rate-500"

```bash
5 $ lctl set_param ost.OSS.ost_1o.nrs_tbf_rule-\
```
6 "'start loginnode nid-｛192.168.1.1@tcp｝ rate=100"
在这个例子中，计算节点的RPC 请求处理速率最大时是登录节点 RPC 请求处理速
率的5倍。ost.osS.ost_io.nrs_tbf_rule 的输出类似于：
1 lct1 get_param ost.OsS.ost_io.nrs_tbf_rule
2 ost.OsS.ost_io.nrs_tbf_rule-

3 regular_requests：
4 CPT 0：
5 loginnode ｛192.168.1.1etcp｝ 100,ref 0
6 computes ｛192.168.1.［2-128］@tcp｝ 500, ref 0
7 other_clients ｛192.168.*.*etcp｝ 50,ref 0
8 default ｛*｝ 10000,ref 0
9 high_priority_requests：
10 CPT 0：
11 loginnode ｛192.168.1.1@tcp｝100,ref 0
12 computes ｛192.168.1.［2-128］@tcp｝ 500, ref 0
13 other_clients ｛192.168.*.*etcp｝ 50,ref 0
14 default ｛*｝10000,ref 0
规则也可使用 reg 和 hp格式进行描述：

```bash
1 $ lctl set_param ost.OSS.ost_10.nrs_tbf_ruler\
```
2 "reg start loginnode nid-｛192.168.1.1@tcp｝ rate=100"

```bash
3 s lctl set_param ost.OSS.ost_10.nrs_tbf_rule-\
```
4 "hp start loginnode nid-｛192.168.1.1@tcp｝rate=100"

- 基于 JobID的TBF策略
命令：
1 lct1 set_param x.x.x.nrs_
-tbf_rule=
2 "［reglhp］ start rule_name jobid=｛jobid_1ist） rate=rate"
支持的 Wildcard 显示在｛jobid_list｝中。
示例：

```bash
1 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule-\
```
2 "'start iozone_user jobid-｛iozone.500｝ rate=100"

```bash
3 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule\
```
4 "'start dd_user jobid=｛dd. *｝ rate=50"
s $ lct1 set_param ost.OSS.ost_10.nrs_tbf_rule=\
6 "start userl jobid=｛*.600｝ rate-10"

```bash
7 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule\
```
8 "start user2 jobid=｛io*.10* *.500｝ rate-200"
规则也可使用 reg 和 hp格式进行描述：

I $ lct1 set_param ost.OSS.ost_1o.nrs_tbf_rule\
2 "hp start iozone_user1 jobid=｛iozone. 500｝ rate-100"

```bash
3 s lctl set_param ost.OSS.ost_10.nrs_tbf_
```
_rule=\
4 "reg start iozone_user1 jobid-｛iozone.500｝ rate=-100"

- 基于 Opcode 的TBF策略
命令：
1 $ lct1 set_param x.x.x.nrs_tbf_rule-
2 "［reglhp］ start rule_name opcode- ｛opcode_1ist｝ rate-rate"
示例：

```bash
1 $ lctl set_param ost.OSS.ost_10.nrs_thf_rule\
```
2 "'start userl opcode-｛ost_read｝ rate-=100"
3 $ lct1 set_param ost.OSS.ost_io.nrs_tbf_rule=\
4 "'start iozone_userl opcode-｛ost_read ost_write｝
rate-200"
规则也可使用 reg 和 hp格式进行描述：
1 $ lct1 set_param ost.OSS.ost_10.nrs_tbf_rule\
2 "'hp start iozone_user1 opcode=｛ost_read｝ rate-100"

```bash
3 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule=\
```
4 "reg start iozone_user1 opcode-｛ost_read） rate=100"

- 基于 UID/GID 的TBF策略
命令：

```bash
1 $lctl set_param ost.OSS.*.nrs_tbf_rule=\
```
2 "Iregl ［hP］ start rule_name uid-｛uid） rate-rate"

```bash
3 $ lctl set_param ost.OSS. *.nrs_tbf_rule=\
```
4 "［regl ［hp］ start rule_name gid-｛gid｝ rate=rate"
示例：
限制 uid 500的RPC 请求速率：
s lct1 set_param ost.osS.*.nrs_tbf_rule=\ "start tbf_name
uid=1500｝ rate=100"
限制 gid 500的RPC 请求速率：

```bash
1 $ lctl set_param ost.OSS.*.nrs_tbf_rule=\
```
2 ''start tbf _name gid=（500） rate=100"

您也可以使用以下的规则控制 MDS上的请求。
在 MDS 上启动 tbfuid QoS：
s lct1 set_param mds.MDS.*.nrs_policies="tbf uid"
限制uid 500的RPC 请求速率：

```bash
1 $ lctl set_param mds.MDS.*.nrs_tbf_rule\
```
2 "'start tbf_name uid=｛500｝ rate=100"

- 策略合并
支持具有复杂条件表达式的TBF 规则，可以使用 TBF 分类器以更细粒度的方式
对RPC进行分类。此功能支持不同类型之间的逻辑操作。其中，“&"代表条件与，“，”
代表条件或。
示例：

```bash
1 s lctl set_param ost.OSS.ost_10.nrs_tbf_rule-\
```
2 "start comp_rule opcode-｛ost_writel&jobid=｛dd.O｝\
3 nid=｛192.168.1.［1-128］@tcp 0@1o｝ rate=100"
在这个例子中，那些 opcode 为 Ost_write 且 jobid 为 dd. 0，或nid满
足/192.168.1.［1-128/@tcp 0@lo｝ 条件的RPC 将以100 req/sec 的速率进行处理。
ost.OSS.ost_io.nrs_tbf
_rule的输出类似于：
I $ lct1 get_param ost.OsS.ost_1o.nrs_tbf_rule
2 ost.OSS.ost_1o.nrs_tbf_rule-
3 regular_requests：
4 CPT 0：
5 comp_rule opcode-｛ost_write） &jobid=｛dd. O｝，nid=｛192.168.1.［1-128］etcp 0e1o｝
100,ref 0
6 default * 10000,ref 0
7 CPT 1：
8 comp_rule opcode-=｛ost_write &jobid=｛dd. O｝，nid=｛192.168.1. ［1-128］etcp Oe1o｝
100,ref 0
9 default * 10000,ref 0
10 high_ priority_requests：
11 CPT 0：
12 comp_rule opcode-｛ost_write｝ &jobid=｛dd.O｝，nid=｛192.168.1.［1-128］etcp 0e1o｝
100,ref 0
13 default * 10000, ref 0

14 CPT 1：
15 comp_rule opcode-｛ost_write &jobid=｛dd. O｝，nid-｛192.168.1.［1-128］etcp 0e1o｝
100,ref0
16 default * 10000, ref 0
示例：
1 $ lct1 set_param ost.OSS.*.nrs_tbf_rule-\
2 "'start tbf_name uid=｛500｝ &gid=（500｝ rate-100"
在这个例子中，那些uid为500且 gid为500的 RPC 将以100 reg/sec 的速率进行
处理。

### 34.6.5.3. 更改 TBF 规则 命令：

1 lct1 set_param x.x.x.nrs_tbf_rule-
2 "［reg|hp］ change rule_name rate-rate"
示例：

```bash
1 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule=\
```
2 "change 1oginnode rate-200"
3 $ lct1 set_param ost.OsS.ost_io.nrs_tbf_rule\
4 "reg change loginnode rate-200"
s $ lct1 set_param ost.OSS.ost_1o.nrs_tbf_rule\
6 "hp change loginnode rate-200"

### 34.6.5.4. 停用 TBF 规则 命令：

1 lct1 set_param x.x.x.nrs_tbf_rule " ［reglhp］ stop
2 rule_name"
示例：

```bash
1 s lctl set_param ost.OSS.ost_10.nrs_tbf_rule-"stop loginnode"
```

```bash
2 $ lctl set_param ost.OSS.ost_io.nrs_tbf_
```
_mule-"reg stop loginnode"

```bash
3 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule-"hp stop 1oginnode"
```

### 34.6.5.5. 规则选项 为支持更灵活的规则，添加了以下选项：


- 将TBF规则重新排序

默认情况下，新启用的规则优先于旧规则，但在使用"start"命令插入新规则时同
时指定参数"rank =”，可以更改规则的排序。此外，还可以通过"change"命令更改规则
的排序。
命令：
1 lct1 set_param ost.OSS.ost_io.nrs_tbf_rule-
2 "'start rule_name arguments... rank-obj_rule_name"
3 lct1 set_param ost.OSS.ost_io.nrs_tbf_rule-
4 "change rule_name rate-rate rank-obj_rule_name"
通过指定已存在的规则obi_rule_name，新规则'rule_name' 可被移至该条规
则obj_rule_name 之前。
示例：

```bash
1 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule-\
```
2 "'start computes nid-｛192.168.1.［2-128］@tcp｝ rate=-500"

```bash
3 $ lctl set_param ost.OSS.ost_i0.nrs_tbf_rule-\
```
4 "start userl jobid=｛iozone.500 dd.500｝ rate=100"

```bash
s $ lctl set_param ost.OSS.ost_i0.nrs_tbf_rule-\
```
6 "'start iozone_user1 opcode-｛ost_read ost_write｝ rate-200 rank-computes"
在这个例子中，规则"iozone_userI”被添加至规则"computes”之前，顺序如下：

```bash
1 s lctl get_param ost.OSS.ost_io.nrs_tbf_rule
```
2 ost.OSS.ost_io.nrs_tbf_rule-
3 regular_requests：
4 CPT 0：
5 user1 jobid-｛iozone.500 dd. 500｝100,ref 0
6 iozone_user1 opcode-｛ost_read ost_write） 200, ref 0
7 computes nid-｛192.168.1.［2-128］@tcp｝ 500, ref 0
8 default * 10000,ref 0
9 CPT 1：
10 user1 jobid｛iozone.500 dd. 500｝100, ref 0
11 iozone_user1 opcode-｛ost_read ost_write） 200, ref 0
12 computes nid=｛192.168.1.［2-128］@tcp｝ 500, ref 0
13 default * 10000,ref 0
14 high_priority_requests：
15 CPT 0：
16 user1 jobid-｛iozone.500 dd.500｝100,ref 0
17 iozone_user1 opcode-｛ost_read ost_write｝ 200，
ref O

18 computes nid-｛192.168.1.［2-128］etcp｝ 500, ref 0
19 default * 10000,ref 0
20 CPT 1：
21 userl jobid-｛iozone.500 dd.500｝ 100,ref 0
22 iozone_user1 opcode-fost_read ost_write｝ 200, ref 0
23 computes nid=｛192.168.1.［2-128］@tcp｝ 500, ref 0
24 default * 10000, ref 0

- 拥塞下的TBF 实时策略
在评估 TBF 期间，我们发现当所有类的1/O 带宽需求总和超过系统容量时，具有相
同速率限制的类获得的带宽要比预先均衡配置所获得得带宽要少。造成这种情况的原因
是拥塞服务器上的繁重负载会导致某些类错过最后期限。在出列时，令牌的数量可能大
于1。在量初的实现中，所有类都被平等对待，以轻松丢弃超额的令牌。
随着硬令牌补偿（HTC）策略的实施，我们使用HTC匹配的规则对类进行配置。这
个特性意味着该类队列中的请求具有较高的实时性要求，必须尽可能满足带宽分配。当
错过最后期限时，该类保持最后期限不变，剩余的时间（剩余的流逝时间除以 1/）将
被补偿到下一轮。从而确保了下一个空闲1/O线程始终选择此类来服务，直到所有累计
的超额令牌处理完毕或该类队列中没有挂起的请求。
命令：
添加实时特性的新命令格式：
1 lct1 set_param x.x.x.nrs.
3_tof
_5ule\
2 "'start rule_name arguments.•. realtime-1
示例：

```bash
1 $ lctl set_param ost.OSS.ost_io.nrs_tbf_rule-
```
2 "start realjob jobid-｛dd.0｝ rate-100 realtime-1
在这个例子中，那些JobID 为dd.O的RPC 将以100 req/sec 的速率进行实时处
理。（在 Lustre 2.10中引入）

### 34.6.6. 延迟策略

NRS 延迟策略旨在通过干扰 PRPC层的请求处理时间来模拟高服务器负载，从而
暴露与时间有关的问题。如果启用此策略，将在请求到达时计算应该开始处理请求的时
间位移量，并允许其在用户定义的范围内波动。然后使用cfs_binheap将请求按照分
配的开始时间进行排序，并保存。一旦请求的开始时间已过，它将从 binheap 中移除以
供处理。

延迟策略可在所有类型的 PHRPC服务上启用，有以下可用于调整其行为的可调参
数：

- ｛service｝.nrs_delay_min
｛service｝.nrs_delay_min 用于控制请求被此策略延迟的最短时间量（以秒为
单位）。默认值是5秒。读取此值运行：
Ictl get_param ｛servicel.nrs_delay_min
例如，在ost_io 服务上读取最小延迟设置：

```bash
$ Ict1 get_param ost.OSS.ost_10.nrs_delay_min
```
ost.OSS.ost_io.nrs_delay_min-reg_delay_min: 5
hp_delay_min: 5
设置 RPC 处理的最小延迟：
Ict1 set_param ｛service） .nrs_delay_min=0-65535
这将为常规和高优先级 RPC设置给定服务的最小延迟时间。
例如，要将ost_io 服务的最小延迟时间设置为10，请运行：

```bash
$ lct1 set_param ost.OSS.ost_io.nrs_delay_min-10
```
ost.OsS.ost_io.nrs_delay_min-10
对于支持高优先级RPC的PtRPC服务，可为常规和高优先级 RPC设置不同的最小
延迟时间：
1ct1 set_param ｛service） .nrs_delay_min-reg_delay_minlhp_delay_min: 0-65535
例如，在ost_io 服务上将高优先级 RPC 的最小延迟时间设置为3：

```bash
$ lctl set_param ost.osS.ost_1o.nrs_delay_min-hp_delay_min:3
```
ost.OsS.ost_io.nrs_delay_min-hp_delay_min:3
请注意，在任何情况下最小延迟时间都不能超过最大延迟时间。

- ｛service｝.nrs_delay_max
｛service｝.nrs_delay_max 用于控制请求被此策略延迟的最长时间量（以秒为
单位）。默认值是300秒。读取此值运行：
lct1 get_param ｛service｝.nrs_delay_max
例如，在 ost_io 服务上读取最大延迟设置：


```bash
s lctl get_param ost.OSS.ost_
```
_10.nrs_delay_max
ost.OSS.ost_io.nrs_delay_max-reg_delay_max: 300
hp_delay_max:300
设置 RPC 处理的最大延迟：
Ict1 set_param ｛service） .nrs_delay_max=0-65535
这将为常规和高优先级 RPC 设置给定服务的最大延迟时间。
例如，要将ost_io服务的最大延迟时间设置为60，请运行：

```bash
f lctl set_param ost.OSS.ost_io.nrs_delay_max-60
```
ost.OSs.ost
_io.nrs_delay_max=60
对于支持高优先级 RPC的PtRPC服务，可为常规和高优先级 RPC设置不同的最大
延迟时间：
lct1 set_param ｛servicel .nrs_delay_max=reg_delay_max|hp_delay_max: 0-65535
例如，在ost_io 服务上将高优先级 RPC的最大延迟时间设置为30：
s lct1 set_param ost.OSS.ost_io.nrs_delay_max-hp_delay_max:30
ost.OSS.ost
_io.nrs_delay_max-hp_delay_max:30
请注意，在任何情况下最长延迟时间都不能小于最短延迟时间。

- ｛service｝.nrs_delay_pct
｛service｝.nrs_delay_pct 用于控制会被此延迟政策推迟的请求的百分比。默
认值是100。请注意，如果某一请求没有被延迟策略选中并推迟处理请求，该请求将由
该服务定义的回退策略来处理。如果没有定义其他回退策略，则该请求由 FIFO 策略处
理。读取此值请运行：
lct1 get_param ｛service）.nrs_delay_pct
在ost_io服务上读取被延迟的请求的百分比，请运行：
s lct1 get_param ost.OSS.ost_io.nrs_delay_pct
ost.OSS.ost_1o.nrs_delay_ pct=reg_delay_pct:100
hp_delay_pct:100
设置延迟请求的百分比：
lct1 set_param ｛service｝.nrs_delay_pct=0-100
这将为常规和高优先级 RPC设置给定服务的请求延迟的百分比。
例如，要将ost_io 服务的请求延迟的百分比设置为50，请运行：


```bash
$ Lctl set_param ost.OSS.ost_10.nrs_delay_pct=50
```
ost.OSS.ost_io.nrs_delay_pct=50
对于支持高优先级 RPC的PRPC服务，可常规和高优先级 RPC设置不同的请求
延迟的百分比：
lct1 set_param ｛service｝.nrs_delay_pct-reg_delay_pct |hp_delay_pct: 0-100
例如，在ost_io服务上将高优先级 RPC的请求延迟的百分比设置为5：

```bash
$ lct1 set_param ost.osS.ost_i0.nrs_delay_pct-hp_delay_pct:5
```
ost.OSS.ost_io.nrs_delay_ pct-hp_delay_pct:5

### 34.7.无锁1/0可调参数

无锁1/O 可调特性允许服务器请求客户端执行无锁1/O（服务器代表客户端进行锁
定）以避免争用文件的 ping-pong锁定。
无锁1/O 补丁引入了这些可调参数：

- OST-side：
1dlm.namespaces.filter-fsname-*.
contended
_1ocks-如果超出conarded_1ocks指定的授权等待队列扫描中的
锁冲突数量，则认为该资源为争用资源。
contention_seconds一该资源保持争用状态时长。
max_nolock_bytes -服务器锁定小于max_nolock_bytes的块设置的请求。
如果此值被设置为零，则禁止服务器端锁定读取/写入请求。

- Client-side：
/proc/fs/lustre/1lite/lustre-*
contention_seconds- 11ite 节点将记住其争用状态的时长。

- Client-side statistics：
无锁IO统计信息将会被记录在/proc/fs/1ustre/1lite/lustre-*/stats
文件中。
lockless
_read
_bytes 和 lockless_write_bytes-计算读取或写入的总字
节数时，如果请求大小小于min_nolock_size，则客户端不会与服务器通信，也不会
获取客户端的锁定。
（在Lustre 2.9中引入）


### 34.8.服务器端建议和提示


### 34.8.1.概述

使用1fs ladvise命令为服务器提供有关文件访问的建议和提示。
1 lfs ladvise ［--advicel-a ADVICE ］［--background|-b］
2 ［--start|-s START［KMGT］］
3 ｛［--endl-e END［KMGT］］| ［--length|-1 LENGTH［KMGT］］｝
4 file..
选项
-a，--advice= ADVICE
说明
-b，--background
-s，--start= START_OFESET
-e，--end= END_OFESET
-1，--length= LENGTH
-m ，--mode= MODE
提供ADVICE类型的建议或提示。ADVICE类型包括：
willread-将数据预先导入服务器缓存；
dontneed-清除服务器缓存；
lockahead一在给定字节范围内请求给定模式的
LDLM 范围锁；
noexpand禁止对此文件描述符的1/O 的范围锁扩
展行 。
允许建议的发送和处理异步。
文件范围起始于 START_OFESET。
文件范围终止于（不包括）END_OFESET。该选项
不能与1选项同时指定。
文件范围长度为LENGTH。该选项不能与-e选项
同时指定。
Lockahead 请求模式｛READ,WRITE）。请求一个该
模式下的锁。
通常，1fs ladvise会将建议转发给 Lustre 服务器，但无法保证何时以及哪些服
务器会对建议做出反应。根据不同建议的类型以及受影响的服务器端组件的实时决策情
况，建议可能会触发操作也可能不会触发操作。
ladvise 的典型用例是使具有外部知识的应用程序和用户能够介入服务器端缓存管
理。例如，如果大量不同的客户端正在对文件进行小的随机读取，则在随机 1/O 发生之

前以大线性读取的方式预取页到OSS缓存的做法效益可观。由于发送到客户端的数据
还要多得多，可能无法使用 fadviseO 将数据提取到每个客户端缓存中。
ladvise lockahead的不同之处在于它试图通过在使用之前明确请求LDLM 锁
来控制LDLM 锁定行为。这不会直接影响缓存行为，相反，它可以在特殊情况下用于避
免正常 LDLM 锁定行为导致的病态结果（锁定交换）。
请注意，noexpand建议适用于特定的文件描述符，因此通过Is使用它并不起作
用。它只能用特定的用于I/O的文件描述符。
Linux 系统调用fadvise（）和1fs ladvise之间的主要区别在于fadvise（）只是
一个客户端机制，它不会将建议传递给文件系统，而ladvise可以向 Lustre 服务器端发
送建议或提示。

### 34.8.2. 示例

下面的例子中，持有第一个 IGB 的/mnt/1uster/ file1得到提示：即将读取文
件的前1GB 部分。：
1 client1$ lfs ladvise -a willread -s 0 -e 1048576000 /mnt/lustre/filel/
下面的例子中，持有第一个 1GB 的/mnt/luster/ file1得到提示：文件的前
IGB 部分在近期不会被读取，所以OST 可以在内存中清除该文件的缓存。
1 client1$ lfs ladvise -a dontneed -s 0 -e 1048576000 /mnt/lustre/filel
请求文件/mnt/luster/fi1e1的前1MiB 的LDLM 读取锁，这将尝试从保存有
该文件此区域的 OST 请求一个锁：
1 client1$ lfs ladvise -a lockahead -m READ -s 0 -e 1M /mnt/lustre/filel
请求文件/mnt/luster/file1［3 MiB, 10 MiB］ 范围的LDLM写入锁，这将尝试
从保存有该文件此区域的 OST 请求一个锁：
1 client1$ lfs ladvise -a lockahead -m WRITE -s 3M -e 10M /mnt/lustre/file1

### 34.9. 大批量1/O （16MB RPC）


### 34.9.1.概述

从 Lustre 2.9起，Lustre 支持的RPC 大小最大已扩展到16MB。在客户端和服务器
之间传输相同数量的数据，启用更大的RPC 意味着需要更少的RPC，OSS 可以同时向
底层磁盘提交更多数据，因此可以生成更大的磁盘1/0以充分利用磁盘日益增加的带宽。
在客户端连接时，客户端将与服务器协商允许使用的最大 RPC。客户端始终可以发
送小于此最大值的 RPC。

客户端可通过在 OST上使用参数brw_size来获知最大（首选）1/O大小。
所有与此目标交互的客户端都不能发送大于此值的 RPC。客户端可以通过
osc.*.nax_pages_per_rpc 可调参数单独设置较小的 RPC大小限制。
注意
可为 ZFS OST 设置的最小brw_size大小即该数据集的recordsize 大小。这可
以确保客户端可以随时写入完整的ZFS文件块，而不会强制为每个 RPC执行读/修改/写
操作。

### 34.9.2.示例

为了启用更大的 RPC 大小，必须将brw_size的10 大小值更改为16MB。临时更
改brw_size，请在 OSS上运行以下命令：

```bash
1 oss# lctl set_param obdfilter.fsname-oST*.brw_size=16
```
要持久地更改brw_size，请运行：
1 oss# lct1 set_param -P obdfilter.fsname-OST*.brw_size-16
当客户端连接到 OST 目标时，它将从目标中获取brw_size，并从brw_size中
获得其最大值和本地设置作为max_pages_per_rpc的实际 RPC 大小。因此，要启用
16MB 的 RPC，客户端的max_pages_per_rpc必须设置力16M（如果 PAGESIZE为
4KB，则为4096）。临时更改max_pages_per_rpc请在客户端上运行以下命令：
1 clients lct1 set_param osc.fsname-OST*.max_ pages_per_rpc=16M
使更改永久生效，运行：
1 clients lct1 set_param -P obdfilter.fsname-osT*.osc.max_pages_per_rpc-16M
注意
OST 的brw_size可以随时更改。但客户端必须重新安装并重新协商 RPC最大大
小。

### 34.10. 提升 Lustre 小文件 I/O 性能

应用程序将小文件块从多个客户端写入单个文件可能会导致较差的1/O 性能。提高
Lustre 文件系统小文件的1/O 性能，我们可以：

- 在将1/O提交到 Lustre 文件系统之前，应用程序先进行1/0聚合。默认情况下，
Lustre 软件将强制执行POSIX 语义一致性。因此，如果它们都同时写入同一文
件会导致客户端节点之间发生 ping-pong 锁定。如果应用程序使用MPI-IO，则实
现此功能的一种直接的方法是在 Lustre ADIO 驱动程序中使用 MPI-IO Collective
Write 功能。

