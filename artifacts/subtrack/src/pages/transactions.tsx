import { useState } from "react";
import { useListTransactions } from "@workspace/api-client-react";
import { format, parseISO } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Receipt, Search } from "lucide-react";

export default function Transactions() {
  const [searchQuery, setSearchQuery] = useState("");
  
  const { data: transactions, isLoading } = useListTransactions(undefined, {
    query: { queryKey: ["/api/transactions"] }
  });

  const formatCurrency = (amount: number, currency: string = "GBP") => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount);
  };

  const filteredTransactions = transactions?.filter(t => 
    t.merchantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.category && t.category.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transactions</h2>
          <p className="text-muted-foreground mt-1">Raw payment data synced from your banks.</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search transactions..."
            className="pl-9 w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <Card className="shadow-sm border-muted">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex justify-between items-center border-b pb-4">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-[150px]" />
                    <Skeleton className="h-3 w-[100px]" />
                  </div>
                  <Skeleton className="h-5 w-[80px]" />
                </div>
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-secondary mb-4">
                <Receipt className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium text-foreground mb-1">No transactions found</h3>
              <p className="text-sm text-muted-foreground">
                Connect a bank account to start seeing transactions here.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((t) => (
                  <TableRow key={t.id} className="group">
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {format(parseISO(t.transactionDate), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {t.merchantName}
                    </TableCell>
                    <TableCell>
                      {t.category ? (
                        <span className="text-xs px-2 py-1 bg-secondary rounded-md text-secondary-foreground">
                          {t.category}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {t.isSubscription && (
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-normal text-xs">
                          Subscription
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {formatCurrency(t.amount, t.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
